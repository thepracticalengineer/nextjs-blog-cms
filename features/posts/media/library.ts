import 'server-only'
import { authorizeApi } from '@/lib/auth/api'
import { createServiceClient } from '@/lib/supabase/service'
import type { MediaAsset, MediaLibraryPage } from './library-types'

const columns = 'id,url,original_filename,title,alt_text,caption,description,width,height,byte_size,uploaded_at,archived_at'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const limits = { title: 255, alt_text: 1000, caption: 2000, description: 5000 }
export const mediaResponse = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const fail = (error: string, status = 400) => mediaResponse({ error }, status)
const assetDto = (row: MediaAsset) => Object.fromEntries(columns.split(',').map(key => [key, row[key as keyof MediaAsset]]))
class MediaInputError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader()
  if (!reader) throw new MediaInputError('Invalid media request.')
  let length = 0
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > 40_000) { await reader.cancel(); throw new MediaInputError('Media metadata is too large.', 413) }
    chunks.push(value)
  }
  let parsed: unknown
  try { parsed = JSON.parse(Buffer.concat(chunks).toString()) }
  catch { throw new MediaInputError('Invalid JSON in media request.') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new MediaInputError('Invalid media request.')
  return parsed as Record<string, unknown>
}

function metadataChanges(body: Record<string, unknown>, select: boolean) {
  const changes: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (key === 'editorId') continue
    if (!select && key === 'archived' && typeof value === 'boolean') { changes[key] = value; continue }
    if (!select && Object.hasOwn(limits, key) && typeof value === 'string' && [...value].length <= limits[key as keyof typeof limits]) { changes[key] = value; continue }
    throw new MediaInputError('Invalid media metadata.')
  }
  if (!select && !Object.keys(changes).length) throw new MediaInputError('Choose metadata to update.')
  return changes
}

function libraryFilters(params: URLSearchParams) {
  const page = Number(params.get('page') ?? '1')
  const sort = params.get('sort') ?? 'newest'
  const filter = params.get('filter') ?? 'active'
  const search = (params.get('q') ?? '').trim()
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !['newest', 'oldest', 'title'].includes(sort) || !['active', 'archived'].includes(filter) || search.length > 200) throw new MediaInputError('Invalid library filters.')
  return { p_search: search, p_page: page, p_sort: sort, p_filter: filter }
}

async function readLibrary(ownerId: string, id: string | undefined, filters: ReturnType<typeof libraryFilters>) {
  const db = createServiceClient()
  if (id) {
    const { data, error } = await db.from('post_media').select(columns).eq('owner_id', ownerId).eq('state', 'active').eq('upload_status', 'ready').eq('id', id).maybeSingle()
    if (error) return fail('Media library is unavailable. Retry shortly.', 503)
    return data ? mediaResponse({ asset: assetDto(data as MediaAsset) }) : fail('Image not found or unavailable.', 404)
  }
  const { data, error } = await db.rpc('list_media_library', { p_owner_id: ownerId, ...filters })
  if (error || !data) return fail('Media library is unavailable. Retry shortly.', 503)
  const page = data as MediaLibraryPage
  return mediaResponse({ assets: page.assets.map(assetDto), total: page.total, page: page.page, pageSize: page.pageSize })
}

async function mutateLibrary(ownerId: string, id: string | undefined, changes: Record<string, unknown>, select: boolean) {
  const { data, error } = await createServiceClient().rpc('mutate_media_library', { p_owner_id: ownerId, p_id: id, p_changes: changes, p_select: select })
  if (error) return fail('Media library could not be updated. Retry shortly.', 503)
  return data ? mediaResponse({ asset: assetDto(data) }) : fail('Image not found or unavailable.', 404)
}

/** All entry points authorize before parsing or constructing a privileged client. */
export async function libraryRequest(request: Request, id?: string, select = false) {
  const { profile, response } = await authorizeApi('posts:create')
  if (response) return response
  const mutation = request.method !== 'GET'
  if (mutation && request.headers.get('origin') !== new URL(request.url).origin) return fail('Use the media library in this application.', 403)
  try {
    const params = new URL(request.url).searchParams
    const body = mutation ? await readBody(request) : {}
    if ((mutation ? body.editorId : params.get('editorId')) !== profile.id) return fail('The signed-in account changed. Sign in with the account that opened this editor, then retry.', 403)
    if (id !== undefined && !uuid.test(id)) return fail('Invalid asset identifier.')
    const changes = mutation ? metadataChanges(body, select) : {}
    const filters = libraryFilters(params)
    return mutation ? await mutateLibrary(profile.id, id, changes, select) : await readLibrary(profile.id, id, filters)
  } catch (error) {
    if (error instanceof MediaInputError) return fail(error.message, error.status)
    return fail('Media library is unavailable. Retry shortly.', 503)
  }
}

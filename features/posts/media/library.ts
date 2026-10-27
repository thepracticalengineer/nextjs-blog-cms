import 'server-only'
import { authorizeApi } from '@/lib/auth/api'
import { createServiceClient } from '@/lib/supabase/service'
import type { MediaAsset } from './library-types'

const columns = 'id,url,original_filename,title,alt_text,caption,description,width,height,byte_size,uploaded_at,archived_at'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const limits = { title: 255, alt_text: 1000, caption: 2000, description: 5000 }
export const mediaResponse = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const fail = (error: string, status = 400) => mediaResponse({ error }, status)
const assetDto = (row: MediaAsset) => Object.fromEntries(columns.split(',').map(key => [key, row[key as keyof MediaAsset]]))

/** All entry points authorize before parsing or constructing a privileged client. */
export async function libraryRequest(request: Request, id?: string, select = false) {
  const { profile, response } = await authorizeApi('posts:create')
  if (response) return response
  const mutation = request.method !== 'GET'
  if (mutation && request.headers.get('origin') !== new URL(request.url).origin) return fail('Use the media library in this application.', 403)
  try {
    const params = new URL(request.url).searchParams
    let body: Record<string, unknown> = {}
    if (mutation) {
      // Bound metadata input independently of Content-Length.
      const reader = request.body?.getReader()
      if (!reader) return fail('Invalid media request.')
      let length = 0
      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > 40_000) { await reader.cancel(); return fail('Media metadata is too large.', 413) }
        chunks.push(value)
      }
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString())
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('Invalid media request.')
      body = parsed as Record<string, unknown>
    }
    if ((mutation ? body.editorId : params.get('editorId')) !== profile.id) return fail('The signed-in account changed. Sign in with the account that opened this editor, then retry.', 403)
    if (id !== undefined && !uuid.test(id)) return fail('Invalid asset identifier.')
    const changes: Record<string, unknown> = {}
    if (mutation) {
      for (const [key, value] of Object.entries(body)) {
        if (key === 'editorId') continue
        if (!select && key === 'archived' && typeof value === 'boolean') { changes[key] = value; continue }
        if (!select && key in limits && typeof value === 'string' && [...value].length <= limits[key as keyof typeof limits]) { changes[key] = value; continue }
        return fail('Invalid media metadata.')
      }
      if (!select && !Object.keys(changes).length) return fail('Choose metadata to update.')
    }
    const page = Number(params.get('page') ?? '1')
    const sort = params.get('sort') ?? 'newest'
    const filter = params.get('filter') ?? 'active'
    const search = (params.get('q') ?? '').trim()
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !['newest', 'oldest', 'title'].includes(sort) || !['active', 'archived'].includes(filter) || search.length > 200) return fail('Invalid library filters.')
    const db = createServiceClient()
    if (mutation) {
      const { data, error } = await db.rpc('mutate_media_library', { p_owner_id: profile.id, p_id: id, p_changes: changes, p_select: select })
      if (error) return fail('Media library could not be updated. Retry shortly.', 503)
      return data ? mediaResponse({ asset: assetDto(data) }) : fail('Image not found or unavailable.', 404)
    }
    let query = db.from('post_media').select(columns, { count: 'exact' }).eq('owner_id', profile.id).eq('state', 'active').eq('upload_status', 'ready')
    if (id) {
      const { data, error } = await query.eq('id', id).maybeSingle()
      if (error) return fail('Media library is unavailable. Retry shortly.', 503)
      return data ? mediaResponse({ asset: data }) : fail('Image not found or unavailable.', 404)
    }
    query = filter === 'active' ? query.is('archived_at', null) : query.not('archived_at', 'is', null)
    if (search) query = query.ilike('search_text', `%${search.replace(/[\\%_]/g, '\\$&')}%`)
    const { data, count, error } = await query.order(sort === 'title' ? 'title' : 'uploaded_at', { ascending: sort !== 'newest', nullsFirst: false }).order('id').range((page - 1) * 24, page * 24 - 1)
    if (error) return fail('Media library is unavailable. Retry shortly.', 503)
    return mediaResponse({ assets: data ?? [], total: count ?? 0, page, pageSize: 24 })
  } catch {
    return fail('Media request failed. Check your connection and retry.', 400)
  }
}

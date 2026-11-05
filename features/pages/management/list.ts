import 'server-only'
import { z } from 'zod'
import { authorizeSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { pageFailure, type PageResult } from '../errors'

const summary = z.object({
  id: z.uuid(), title: z.string(), slug: z.string(), status: z.enum(['draft', 'published']), updated_at: z.string(),
  revision: z.uuid(), parent_id: z.uuid().nullable(), trashed_at: z.string().nullable(),
})
export type PageSummary = z.infer<typeof summary> & { parent_title: string | null }
/** `status=trash` lists recoverable trashed pages; every other view excludes trash. Purged tombstones never appear. */
export async function listPages(input: { q?: string; status?: string; page?: string }): Promise<PageResult<{ pages: PageSummary[]; count: number; page: number }>> {
  const { failure } = await authorizeSession('pages:read')
  if (failure) return { data: null, error: { code: failure.code, message: failure.error } }
  const page = Math.trunc(Math.min(100000, Math.max(1, Number(input.page) || 1)))
  const q = (typeof input.q === 'string' ? input.q : '').trim().slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  try {
    const client = await createClient()
    const trash = input.status === 'trash'
    let query = client.from('pages').select('id,title,slug,status,updated_at,revision,parent_id,trashed_at', { count: 'exact' }).is('purged_at', null)
    query = trash ? query.not('trashed_at', 'is', null) : query.is('trashed_at', null)
    if (q) query = query.filter('title', 'imatch', q)
    if (input.status === 'draft' || input.status === 'published') query = query.eq('status', input.status)
    const { data, error, count } = await query.order(trash ? 'trashed_at' : 'updated_at', { ascending: false }).order('id').range((page - 1) * 20, page * 20 - 1)
    // PostgREST reports ranges beyond the last row as 416, including when a
    // concurrent change empties the current filtered page. Keep navigation usable.
    if (error?.code === 'PGRST103') return { data: { pages: [], count: count ?? 0, page }, error: null }
    const parsed = z.array(summary).safeParse(data)
    if (error || !parsed.success) return pageFailure('PAGE_UNAVAILABLE')
    const parentIds = [...new Set(parsed.data.flatMap(row => row.parent_id ? [row.parent_id] : []))]
    const titles = new Map<string, string>()
    if (parentIds.length) {
      const parents = await client.from('pages').select('id,title').in('id', parentIds)
      const rows = z.array(z.object({ id: z.uuid(), title: z.string() })).safeParse(parents.data)
      if (parents.error || !rows.success) return pageFailure('PAGE_UNAVAILABLE')
      for (const row of rows.data) titles.set(row.id, row.title)
    }
    const pages = parsed.data.map(row => ({ ...row, parent_title: row.parent_id ? titles.get(row.parent_id) ?? null : null }))
    return { data: { pages, count: count ?? 0, page }, error: null }
  } catch { return pageFailure('PAGE_UNAVAILABLE') }
}

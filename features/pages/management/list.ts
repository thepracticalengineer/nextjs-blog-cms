import 'server-only'
import { z } from 'zod'
import { authorizeSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { pageFailure, type PageResult } from '../errors'

const summary = z.object({ id: z.uuid(), title: z.string(), slug: z.string(), status: z.enum(['draft', 'published']), updated_at: z.string() })
export type PageSummary = z.infer<typeof summary>
export async function listPages(input: { q?: string; status?: string; page?: string }): Promise<PageResult<{ pages: PageSummary[]; count: number; page: number }>> {
  const { failure } = await authorizeSession('pages:read')
  if (failure) return { data: null, error: { code: failure.code, message: failure.error } }
  const page = Math.trunc(Math.min(100000, Math.max(1, Number(input.page) || 1)))
  const q = (typeof input.q === 'string' ? input.q : '').trim().slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  try {
    const client = await createClient()
    let query = client.from('pages').select('id,title,slug,status,updated_at', { count: 'exact' })
    if (q) query = query.filter('title', 'imatch', q)
    if (input.status === 'draft' || input.status === 'published') query = query.eq('status', input.status)
    const { data, error, count } = await query.order('updated_at', { ascending: false }).order('id').range((page - 1) * 20, page * 20 - 1)
    // PostgREST reports ranges beyond the last row as 416, including when a
    // concurrent change empties the current filtered page. Keep navigation usable.
    if (error?.code === 'PGRST103') return { data: { pages: [], count: count ?? 0, page }, error: null }
    const parsed = z.array(summary).safeParse(data)
    return error || !parsed.success ? pageFailure('PAGE_UNAVAILABLE') : { data: { pages: parsed.data, count: count ?? 0, page }, error: null }
  } catch { return pageFailure('PAGE_UNAVAILABLE') }
}

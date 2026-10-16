// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getPublishedPosts } from '@/features/posts/queries'
import { getAuthorPublishedPosts } from '@/features/authors/queries'

const state = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => createSupabaseClient('http://127.0.0.1:54321', 'test-anon', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: state.fetch } }) }))
const queries = [
  () => getPublishedPosts(50, 12, { categoryId: 'category' }),
  () => getPublishedPosts(50, 12, { tagId: 'tag' }),
  () => getAuthorPublishedPosts('5af2b64d-c7c0-465f-901f-75cf70737172', 50, 12),
]
afterEach(() => vi.resetAllMocks())
it.each(queries)('recovers the true archive total after a PostgREST unsatisfiable range', async query => {
  state.fetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    if (Number(url.searchParams.get('offset')) > 0) {
      return Response.json({ code: 'PGRST103', message: 'Requested range not satisfiable' }, { status: 416, headers: { 'Content-Range': '*/13' } })
    }
    return Response.json([{ id: 'post', title: 'Visible', slug: 'visible', tags: [] }], { headers: { 'Content-Range': '0-0/13' } })
  })
  expect(await query()).toEqual({ posts: [], total: 13 })
})
it.each(queries)('continues to propagate unrelated database failures', async query => {
  state.fetch.mockResolvedValue(Response.json({ code: 'XX000', message: 'database unavailable' }, { status: 500 }))
  await expect(query()).rejects.toMatchObject({ message: 'database unavailable' })
})

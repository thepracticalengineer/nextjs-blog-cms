import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { getDashboardPosts, getPublishedPosts, PUBLIC_POST_SELECT } from '@/features/posts/queries'
import { parseDashboardListState } from '@/features/posts/list-state'
const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), then: vi.fn() }
const rpc = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  for (const method of ['select', 'eq', 'order', 'range'] as const) chain[method].mockReturnValue(chain)
  chain.then.mockImplementation(resolve => Promise.resolve({ data: [], count: 0 }).then(resolve))
  vi.mocked(createClient).mockResolvedValue({ from: vi.fn(() => chain), rpc } as unknown as Awaited<ReturnType<typeof createClient>>)
})
describe('bounded summary queries', () => {
  it('requests a stable public page without editor fields', async () => {
    await getPublishedPosts(3, 12)
    expect(chain.select).toHaveBeenCalledWith(PUBLIC_POST_SELECT, { count: 'exact' })
    expect(PUBLIC_POST_SELECT).not.toMatch(/\*|\bcontent\b|seo_title/)
    expect(PUBLIC_POST_SELECT).toContain('reading_time_minutes')
    expect(chain.order).toHaveBeenNthCalledWith(1, 'published_at', { ascending: false, nullsFirst: false })
    expect(chain.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false })
    expect(chain.range).toHaveBeenCalledWith(24, 35)
  })
  it('filters tag posts on the server without filtering displayed tags', async () => {
    await getPublishedPosts(1, 12, { tagId: 'tag' })
    expect(chain.select.mock.calls[0][0]).toContain('matching_tags:post_tags!inner(tag_id)')
    expect(chain.eq).toHaveBeenCalledWith('matching_tags.tag_id', 'tag')
    expect(chain.eq).toHaveBeenCalledWith('status', 'published')
  })
  it('bounds invalid public ranges and propagates database errors', async () => {
    await getPublishedPosts(-5, 100000)
    expect(chain.range).toHaveBeenCalledWith(0, 9)
    chain.then.mockImplementation(resolve => Promise.resolve({ error: new Error('unavailable') }).then(resolve))
    await expect(getPublishedPosts()).rejects.toThrow('unavailable')
  })
  it('normalizes nullable tag joins and applies category filtering', async () => {
    chain.then.mockImplementation(resolve => Promise.resolve({ data: [{ id: 'post', tags: [{ tag: { id: 'tag', name: 'Tag', slug: 'tag' } }, { tag: null }] }], count: 1 }).then(resolve))
    const result = await getPublishedPosts(1, 12, { categoryId: 'category' })
    expect(chain.eq).toHaveBeenCalledWith('category_id', 'category')
    expect(result.posts[0].tags).toEqual([{ id: 'tag', name: 'Tag', slug: 'tag' }])
  })
  it('propagates failed dashboard requests rather than displaying a false empty state', async () => {
    rpc.mockResolvedValue({ error: new Error('offline') })
    await expect(getDashboardPosts(parseDashboardListState({}))).rejects.toThrow('offline')
  })
  it('uses the authenticated dashboard RPC and preserves complete counts and facets', async () => {
    const result = { posts: [], total: 1500, page: 100, categories: [{ id: 'category', name: 'Engineering' }] }
    rpc.mockResolvedValue({ data: result })
    expect(await getDashboardPosts(parseDashboardListState({ page: '100', q: '100%' }))).toEqual(result)
    expect(rpc).toHaveBeenCalledWith('get_dashboard_posts', { p_page: 100, p_page_size: 10, p_search: '100%', p_category_id: null, p_sort: 'updated_at', p_direction: 'desc' })
  })
})

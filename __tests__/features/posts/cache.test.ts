import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { revalidatePath } from 'next/cache'
import { refreshDraftPaths, refreshPostPaths } from '@/features/posts/cache'
beforeEach(() => vi.clearAllMocks())
it('refreshes all publication surfaces and old/new URLs without flushing the root layout', () => {
  refreshPostPaths('old', 'new', 'old', null, undefined)
  expect(vi.mocked(revalidatePath).mock.calls).toEqual([
    ['/dashboard/posts'], ['/'], ['/blog', 'layout'], ['/authors/[id]', 'page'], ['/sitemap.xml'], ['/blog/old'], ['/blog/new'],
  ])
})
it('keeps draft changes scoped to the dashboard', () => {
  refreshDraftPaths()
  expect(vi.mocked(revalidatePath).mock.calls).toEqual([['/dashboard/posts']])
})

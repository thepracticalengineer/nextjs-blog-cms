import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({ getProfile: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/features/posts/cache', () => ({ refreshPostPaths: vi.fn() }))
vi.mock('@/features/newsletter/actions', () => ({ cancelNewsletterSend: vi.fn() }))
import { bulkPostAction } from '@/features/posts/bulk-actions'
import { getProfile } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { cancelNewsletterSend } from '@/features/newsletter/actions'
import { refreshPostPaths } from '@/features/posts/cache'
import { postClient, validPost } from '../../helpers/publication'
const id = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
const item = { id, updatedAt: validPost.updated_at }
function setup(rows: Parameters<typeof postClient>[0] = [{ ...validPost, id, status: 'published' }]) {
  const db = postClient(rows)
  vi.mocked(createClient).mockResolvedValue(db.client as unknown as Awaited<ReturnType<typeof createClient>>)
  return db
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getProfile).mockResolvedValue({ id: 'user-1', role: 'author' } as Awaited<ReturnType<typeof getProfile>>)
})
describe('bulk post mutations', () => {
  it('rejects anonymous requests without touching the database', async () => {
    vi.mocked(getProfile).mockResolvedValue(null)
    expect((await bulkPostAction('delete', [item])).error).toBe('Unauthorized')
    expect(createClient).not.toHaveBeenCalled()
  })
  it.each([[], [{ ...item, id: 'bad' }], [item, item], Array.from({ length: 51 }, () => item)].map(items => ({ items })))('rejects invalid or duplicate batches', async ({ items }) => {
    expect((await bulkPostAction('delete', items)).error).toBeDefined()
    expect(createClient).not.toHaveBeenCalled()
  })
  it('unpublishes published posts and skips drafts without overwriting their content', async () => {
    const db = setup([{ ...validPost, id, status: 'published' }, { ...validPost, id: other, status: 'draft' }])
    const result = await bulkPostAction('unpublish', [item, { ...item, id: other }])
    expect(result.results?.map(r => r.status)).toEqual(['success', 'skipped'])
    expect(db.posts[0]).toMatchObject({ status: 'draft', content: validPost.content, published_at: null })
    expect(cancelNewsletterSend).toHaveBeenCalledExactlyOnceWith(id)
    expect(refreshPostPaths).toHaveBeenCalled()
  })
  it('checks ownership per ID and continues after a failure', async () => {
    const db = setup([{ ...validPost, id, status: 'published', author_id: 'other-user' }, { ...validPost, id: other, status: 'published' }])
    const result = await bulkPostAction('delete', [item, { ...item, id: other }])
    expect(result.results?.map(r => r.status)).toEqual(['failed', 'success'])
    expect(db.posts.map(p => p.id)).toEqual([id])
  })
  it('permits an admin to delete another author’s post', async () => {
    setup([{ ...validPost, id, status: 'published', author_id: 'other-user' }])
    vi.mocked(getProfile).mockResolvedValue({ id: 'admin', role: 'admin' } as Awaited<ReturnType<typeof getProfile>>)
    expect((await bulkPostAction('delete', [item])).results?.[0].status).toBe('success')
  })
  it('fails stale and missing posts without side effects', async () => {
    const db = setup()
    const result = await bulkPostAction('unpublish', [{ ...item, updatedAt: 'stale' }, { ...item, id: other }])
    expect(result.results?.every(r => r.status === 'failed')).toBe(true)
    expect(db.writes).toEqual([])
    expect(cancelNewsletterSend).not.toHaveBeenCalled()
  })
  it('reports write failures and preserves retryable posts', async () => {
    const db = setup(); db.failQuery('posts', 'delete')
    expect((await bulkPostAction('delete', [item])).results?.[0].status).toBe('failed')
    expect(db.posts).toHaveLength(1)
  })
  it.each(['delete', 'unpublish'] as const)('fails a concurrent %s without reporting a zero-row write as success', async action => {
    const db = setup()
    db.observeQueries(query => {
      if (query.table === 'posts' && query.operation !== 'select') db.posts[0].updated_at = 'changed-after-read'
    })
    expect((await bulkPostAction(action, [item])).results?.[0].status).toBe('failed')
    expect(db.posts[0].status).toBe('published')
    expect(cancelNewsletterSend).not.toHaveBeenCalled()
    expect(refreshPostPaths).not.toHaveBeenCalled()
  })
  it('rejects unknown roles and unsupported actions', async () => {
    vi.mocked(getProfile).mockResolvedValueOnce({ id: 'user-1', role: 'reader' } as unknown as Awaited<ReturnType<typeof getProfile>>)
    expect((await bulkPostAction('delete', [item])).error).toBe('Unauthorized')
    expect((await bulkPostAction('publish' as 'delete', [item])).error).toBeDefined()
    expect(createClient).not.toHaveBeenCalled()
  })
  it('handles nullable legacy versions with an explicit null predicate', async () => {
    const db = setup([{ ...validPost, id, status: 'published', updated_at: null }])
    expect((await bulkPostAction('delete', [{ id, updatedAt: null }])).results?.[0].status).toBe('success')
    expect(db.posts).toHaveLength(0)
  })
  it('reports cache refresh failure as a warning after a confirmed mutation', async () => {
    setup()
    vi.mocked(refreshPostPaths).mockImplementationOnce(() => { throw new Error('cache unavailable') })
    expect((await bulkPostAction('delete', [item])).results?.[0]).toMatchObject({ status: 'success', warning: expect.stringContaining('cache refresh') })
  })
  it('reports a newsletter warning separately from successful unpublish', async () => {
    setup()
    vi.mocked(cancelNewsletterSend).mockRejectedValueOnce(new Error('offline'))
    const result = await bulkPostAction('unpublish', [item])
    expect(result.results?.[0]).toMatchObject({ status: 'success', warning: expect.any(String) })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/auth/session', () => ({ getProfile: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/features/posts/cache', () => ({ refreshPostPaths: vi.fn(), refreshDraftPaths: vi.fn() }))
vi.mock('@/features/newsletter/actions', () => ({ scheduleNewsletterSend: vi.fn(), cancelNewsletterSend: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
import { createPost, publishPost, updatePost, unpublishPost } from '@/features/posts/actions'
import { getProfile } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { refreshDraftPaths, refreshPostPaths } from '@/features/posts/cache'
import { scheduleNewsletterSend, cancelNewsletterSend } from '@/features/newsletter/actions'
import { validPost, postClient } from '../../helpers/publication'
import type { PostFormValues } from '@/features/posts/types'

const values: PostFormValues = {
  ...validPost, cover_image: '', category_id: '', seo_title: validPost.title, tag_ids: [], editorial_reviewed: true,
}
function useDb(posts = [validPost]) {
  const db = postClient(posts)
  vi.mocked(createClient).mockResolvedValue(db.client as unknown as Awaited<ReturnType<typeof createClient>>)
  vi.mocked(createServiceClient).mockReturnValue(db.client)
  return db
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getProfile).mockResolvedValue({ id: 'user-1', role: 'author', full_name: 'Frank Mendez' } as Awaited<ReturnType<typeof getProfile>>)
})
describe('dashboard publication actions', () => {
  it('creates incomplete drafts', async () => {
    const db = useDb([])
    expect((await createPost({ ...values, title: '', content: '', excerpt: '', slug: '' })).error).toBeUndefined()
    expect(db.posts[0]).toMatchObject({ title: '', content: null, status: 'draft' })
    expect(refreshDraftPaths).toHaveBeenCalledOnce()
    expect(refreshPostPaths).not.toHaveBeenCalled()
  })
  it('saves incomplete drafts without invalidating public pages', async () => {
    useDb()
    expect((await updatePost('post-1', { ...values, content: '' })).error).toBeUndefined()
    expect(refreshDraftPaths).toHaveBeenCalledOnce()
    expect(refreshPostPaths).not.toHaveBeenCalled()
  })
  it('preserves a draft when publication fails and does not queue notifications', async () => {
    const db = useDb()
    const result = await publishPost('post-1', { ...values, content: '<p><br></p>' })
    expect(result.fieldErrors).toHaveProperty('content')
    expect(db.posts[0]).toEqual(validPost)
    expect(db.writes).toEqual([])
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it('rejects invalid published edits before changing any live content or taxonomy', async () => {
    const published = { ...validPost, status: 'published' }
    const db = useDb([published])
    expect((await updatePost('post-1', { ...values, title: 'hello this is for test', tag_ids: ['new-tag'] })).fieldErrors).toHaveProperty('title')
    expect(db.posts[0]).toEqual(published)
    expect(db.writes).toEqual([])
  })
  it('requires editorial review on publication and published edits', async () => {
    const db = useDb()
    expect((await publishPost('post-1', { ...values, editorial_reviewed: false })).fieldErrors).toHaveProperty('editorial_reviewed')
    expect(db.writes).toEqual([])
  })
  it('saves and publishes valid input with one post write', async () => {
    const db = useDb()
    expect((await publishPost('post-1', values)).error).toBeUndefined()
    expect(db.posts[0]).toMatchObject({ status: 'published', content: values.content })
    expect(db.writes.filter(write => write.table === 'posts')).toHaveLength(1)
    expect(scheduleNewsletterSend).toHaveBeenCalledExactlyOnceWith('post-1')
    expect(refreshPostPaths).toHaveBeenCalledWith(validPost.slug, values.slug)
  })
  it('rejects concurrent edits without newsletter side effects', async () => {
    const db = useDb(); db.simulateRace()
    expect((await publishPost('post-1', values)).error).toContain('changed')
    expect(db.posts[0]).toEqual(validPost)
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it('rejects a manual save from a stale loaded post before attempting writes', async () => {
    const db = useDb([{ ...validPost, updated_at: '2026-10-07T00:00:00Z' }])
    expect((await updatePost('post-1', values, false, validPost.updated_at)).error).toContain('another editor')
    expect(db.writes).toEqual([])
  })
  it('cannot publish another author’s post', async () => {
    const db = useDb([{ ...validPost, author_id: 'other-author' }])
    expect((await publishPost('post-1', values)).error).toBe('Unauthorized')
    expect(db.writes).toEqual([])
  })
  it('cancels newsletter notifications on unpublication', async () => {
    const db = useDb([{ ...validPost, status: 'published' }])
    expect((await unpublishPost('post-1')).error).toBeUndefined()
    expect(db.posts[0].status).toBe('draft')
    expect(cancelNewsletterSend).toHaveBeenCalledWith('post-1')
  })
})

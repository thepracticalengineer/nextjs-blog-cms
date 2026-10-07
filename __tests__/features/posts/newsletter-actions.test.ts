import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
import { createServiceClient } from '@/lib/supabase/service'
import { scheduleNewsletterSend, cancelNewsletterSend } from '@/features/newsletter/actions'
import { postClient, validPost } from '../../helpers/publication'

beforeEach(() => { vi.clearAllMocks() })
describe('newsletter scheduling', () => {
  it.each([[], [validPost], [{ ...validPost, status: 'published', title: 'hello this is for test' }]].map(posts => ({ posts })))('does not queue removed, draft or placeholder content', async ({ posts }) => {
    const db = postClient(posts)
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    await scheduleNewsletterSend('post-1')
    expect(db.writes).toEqual([])
  })
  it('queues a ready published article', async () => {
    const db = postClient([{ ...validPost, status: 'published' }])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    await scheduleNewsletterSend('post-1')
    expect(db.writes).toEqual([expect.objectContaining({ table: 'newsletter_sends', operation: 'upsert', payload: expect.objectContaining({ post_id: 'post-1', status: 'pending' }) })])
  })
  it('cancels pending or claimed sends while retaining their audit row', async () => {
    const db = postClient()
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    await cancelNewsletterSend('post-1')
    expect(db.writes).toEqual([expect.objectContaining({ table: 'newsletter_sends', operation: 'update', payload: { status: 'failed' } })])
  })
})

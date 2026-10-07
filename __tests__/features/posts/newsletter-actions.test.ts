import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
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
    expect(db.sends).toEqual([expect.objectContaining({ post_id: 'post-1', status: 'pending' })])
  })
  it('restores a canceled pending send on republish with a fresh delay', async () => {
    const db = postClient([{ ...validPost, status: 'published' }], 'Frank Mendez', [{
      post_id: 'post-1', status: 'pending', scheduled_at: '2020-01-01T00:00:00Z',
      sending_started_at: null, sent_at: null,
    }])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    await cancelNewsletterSend('post-1')
    expect(db.sends[0].status).toBe('failed')
    await scheduleNewsletterSend('post-1')
    expect(db.sends).toHaveLength(1)
    expect(db.sends[0].status).toBe('pending')
    expect(Date.parse(db.sends[0].scheduled_at as string)).toBeGreaterThan(Date.now())
  })
  it.each(['sending', 'failed', 'sent'])('never requeues a previously claimed %s send', async status => {
    const send = { post_id: 'post-1', status, sending_started_at: '2026-01-01T00:00:00Z', sent_at: status === 'sent' ? '2026-01-01T00:01:00Z' : null }
    const db = postClient([{ ...validPost, status: 'published' }], 'Frank Mendez', [send])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    if (status === 'sending') await cancelNewsletterSend('post-1')
    await scheduleNewsletterSend('post-1')
    expect(db.sends).toEqual([{ ...send, status: status === 'sending' ? 'failed' : status }])
  })
  it('cancels pending or claimed sends while retaining their audit row', async () => {
    const db = postClient()
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    await cancelNewsletterSend('post-1')
    expect(db.writes).toEqual([expect.objectContaining({ table: 'newsletter_sends', operation: 'update', payload: { status: 'failed' } })])
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
import { createServiceClient } from '@/lib/supabase/service'
import { scheduleNewsletterSend, cancelNewsletterSend } from '@/features/newsletter/actions'
import { postClient, validPost } from '../../helpers/publication'
import { getNewsletterDelayMinutes } from '@/features/newsletter/config'
import { getPostNewsletterState } from '@/features/newsletter/queries'

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.unstubAllEnvs() })
describe('newsletter scheduling', () => {
  it.each([[], [validPost], [{ ...validPost, status: 'published', title: 'hello this is for test' }]].map(posts => ({ posts })))('does not queue removed, draft or placeholder content', async ({ posts }) => {
    const db = postClient(posts)
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    await expect(scheduleNewsletterSend('post-1')).rejects.toThrow()
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
  it.each(['sending', 'failed', 'sent'])('never requeues a possibly delivered %s send', async status => {
    const send = { post_id: 'post-1', status, sending_started_at: '2026-01-01T00:00:00Z', delivery_started_at: '2026-01-01T00:00:00Z', dispatch_token: null, sent_at: status === 'sent' ? '2026-01-01T00:01:00Z' : null }
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
  it('deduplicates concurrent scheduling and preserves the pending deadline on retries', async () => {
    const db = postClient([{ ...validPost, status: 'published' }])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    await Promise.all([scheduleNewsletterSend('post-1'), scheduleNewsletterSend('post-1')])
    expect(db.sends).toHaveLength(1)
    const deadline = db.sends[0].scheduled_at
    vi.stubEnv('NEWSLETTER_DELAY_MINUTES', '120')
    await scheduleNewsletterSend('post-1')
    expect(db.sends[0].scheduled_at).toBe(deadline)
  })
  it.each(['pending', 'sending'])('republish resets an undelivered %s send after cancellation fails', async status => {
    const db = postClient([{ ...validPost, status: 'published' }], undefined, [{ post_id: 'post-1', status, scheduled_at: '2020-01-01T00:00:00Z', sending_started_at: status === 'sending' ? '2026-01-01T00:00:00Z' : null, delivery_started_at: null, dispatch_token: 'old-worker', sent_at: null }])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    await scheduleNewsletterSend('post-1', { resetPendingDelay: true })
    expect(db.sends).toHaveLength(1)
    expect(db.sends[0]).toMatchObject({ status: 'pending', sending_started_at: null, dispatch_token: null })
    expect(Date.parse(db.sends[0].scheduled_at as string)).toBeGreaterThan(Date.now())
  })
  it('restores a claimed failure when no provider handoff occurred', async () => {
    const db = postClient([{ ...validPost, status: 'published' }], undefined, [{ post_id: 'post-1', status: 'failed', sending_started_at: '2026-01-01T00:00:00Z', delivery_started_at: null, dispatch_token: 'old-worker', sent_at: null }])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    await scheduleNewsletterSend('post-1')
    expect(db.sends[0]).toMatchObject({ status: 'pending', sending_started_at: null, dispatch_token: null })
  })
  it.each(['select', 'upsert', 'update'])('reports a %s failure instead of silently succeeding', async operation => {
    const db = postClient([{ ...validPost, status: 'published' }])
    db.failQuery(operation === 'select' ? 'posts' : 'newsletter_sends', operation)
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    await expect(scheduleNewsletterSend('post-1')).rejects.toThrow()
  })
  it('reports cancellation failure and retains the pending queue row', async () => {
    const db = postClient([], undefined, [{ post_id: 'post-1', status: 'pending' }])
    db.failQuery('newsletter_sends', 'update')
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    await expect(cancelNewsletterSend('post-1')).rejects.toThrow()
    expect(db.sends[0].status).toBe('pending')
  })
  it('exposes queue read failures separately from missing sends', async () => {
    const db = postClient()
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    expect(await getPostNewsletterState('post-1')).toMatchObject({ send: null, delayMinutes: 60 })
    db.failQuery('newsletter_sends', 'select')
    expect((await getPostNewsletterState('post-1')).error).toContain('unavailable')
  })
  it.each([
    ['0', 0], ['15', 15], ['', 60], ['-1', 60], ['1.5', 60], ['15oops', 60], ['Infinity', 60], ['9007199254740991', 60],
  ])('uses delay %s consistently in scheduling and the editor', (configured, expected) => {
    vi.stubEnv('NEWSLETTER_DELAY_MINUTES', configured as string)
    expect(getNewsletterDelayMinutes()).toBe(expected)
  })
})

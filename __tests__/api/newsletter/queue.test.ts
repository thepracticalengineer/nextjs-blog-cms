import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
const { providerSend } = vi.hoisted(() => ({ providerSend: vi.fn() }))
vi.mock('resend', () => ({ Resend: vi.fn().mockImplementation(function () { return { emails: { send: providerSend } } }) }))

import { createServiceClient } from '@/lib/supabase/service'
import { scheduleNewsletterSend, cancelNewsletterSend } from '@/features/newsletter/actions'
import { POST } from '@/app/api/newsletter/send/route'
import { postClient, validPost } from '../../helpers/publication'
import type { NextRequest } from 'next/server'

const published = { ...validPost, status: 'published' }
const queued = { id: 'send-1', post_id: 'post-1', status: 'pending', scheduled_at: '2020-01-01T00:00:00Z', sending_started_at: null, sent_at: null }
const recipients = Array.from({ length: 12 }, (_, i) => ({ id: `subscriber-${i}`, email: `isolated-${i}@example.com`, unsubscribe_token: `token-${i}`, subscribed_at: '2020-01-01T00:00:00Z', unsubscribed_at: null }))
const request = () => new Request('http://localhost/api/newsletter/send', { method: 'POST', headers: { 'x-webhook-secret': 'mock-secret' } }) as NextRequest
function useQueue(count = 1) {
  const db = postClient([published], undefined, [queued], [], recipients.slice(0, count))
  vi.mocked(createServiceClient).mockReturnValue(db.client)
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('WEBHOOK_SECRET', 'mock-secret')
  vi.stubEnv('RESEND_API_KEY', 'mock-key')
  vi.stubEnv('RESEND_FROM_EMAIL', 'mock@example.com')
  providerSend.mockResolvedValue({ data: { id: 'provider-id' }, error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('newsletter queue delivery with isolated recipients and provider', () => {
  it('publish then unpublish before dispatch sends no emails, including after cancellation failure', async () => {
    const db = useQueue()
    await scheduleNewsletterSend('post-1')
    db.posts[0].status = 'draft'
    db.failQuery('newsletter_sends', 'update')
    await expect(cancelNewsletterSend('post-1')).rejects.toThrow()
    expect(db.sends[0].status).toBe('pending')
    expect(await (await POST(request())).json()).toEqual({ dispatched: 0 })
    expect(db.sends[0].status).toBe('failed')
    expect(providerSend).not.toHaveBeenCalled()
  })
  it('concurrent dispatches claim the same queue row only once', async () => {
    const db = useQueue(12)
    const responses = await Promise.all([POST(request()), POST(request())])
    const counts = await Promise.all(responses.map(async response => (await response.json()).dispatched))
    expect(counts.sort()).toEqual([0, 1])
    expect(db.sends[0].status).toBe('sent')
    expect(providerSend).toHaveBeenCalledTimes(12)
    expect(new Set(providerSend.mock.calls.map(([payload]) => payload.to)).size).toBe(12)
    await scheduleNewsletterSend('post-1')
    await POST(request())
    expect(providerSend).toHaveBeenCalledTimes(12)
  })
  it('records returned provider errors as failed and never resends a claimed failure', async () => {
    const db = useQueue()
    providerSend.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'Rejected' } })
    expect(await (await POST(request())).json()).toEqual({ dispatched: 0 })
    expect(db.sends[0].status).toBe('failed')
    expect(db.sends[0].sending_started_at).toBeTruthy()
    await scheduleNewsletterSend('post-1')
    await POST(request())
    expect(providerSend).toHaveBeenCalledOnce()
  })
  it('stops later batches if the post is unpublished during delivery', async () => {
    const db = useQueue(12)
    providerSend.mockImplementation(async () => {
      db.posts[0].status = 'draft'
      return { data: { id: 'provider-id' }, error: null }
    })
    expect(await (await POST(request())).json()).toEqual({ dispatched: 0 })
    expect(providerSend).toHaveBeenCalledTimes(10)
    expect(db.sends[0].status).toBe('failed')
  })
  it('preserves a cancellation during the final batch instead of marking it sent', async () => {
    const db = useQueue()
    providerSend.mockImplementation(async () => {
      await cancelNewsletterSend('post-1')
      return { data: { id: 'provider-id' }, error: null }
    })
    expect(await (await POST(request())).json()).toEqual({ dispatched: 0 })
    expect(db.sends[0]).toMatchObject({ status: 'failed', sent_at: null })
  })
  it('fails closed when a between-batch publication check is unavailable', async () => {
    const db = useQueue(12)
    providerSend.mockImplementationOnce(async () => {
      db.failQuery('posts', 'select')
      return { data: { id: 'provider-id' }, error: null }
    })
    expect(await (await POST(request())).json()).toEqual({ dispatched: 0 })
    expect(providerSend).toHaveBeenCalledTimes(10)
    expect(db.sends[0].status).toBe('failed')
  })
  it('reports completion-write failures without allowing a duplicate delivery', async () => {
    const db = useQueue()
    providerSend.mockImplementationOnce(async () => {
      db.failQuery('newsletter_sends', 'update')
      return { data: { id: 'provider-id' }, error: null }
    })
    expect((await POST(request())).status).toBe(500)
    expect(db.sends[0].status).toBe('sending')
    await scheduleNewsletterSend('post-1')
    await POST(request())
    expect(providerSend).toHaveBeenCalledOnce()
  })
})

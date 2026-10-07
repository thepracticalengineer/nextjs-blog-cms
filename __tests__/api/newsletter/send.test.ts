import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/notifications/newsletter', () => ({ sendNewsletterEmail: vi.fn() }))

import { createServiceClient } from '@/lib/supabase/service'
import { sendNewsletterEmail } from '@/lib/notifications/newsletter'
import { validPost } from '../../helpers/publication'
import { GET, POST } from '@/app/api/newsletter/send/route'

const mockCreateServiceClient = vi.mocked(createServiceClient)
const mockSendNewsletterEmail = vi.mocked(sendNewsletterEmail)

const WEBHOOK_SECRET = 'test-secret'

function makeReq(secret?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (secret) headers['x-webhook-secret'] = secret
  return new Request('http://localhost/api/newsletter/send', {
    method: 'POST',
    headers,
  }) as unknown as import('next/server').NextRequest
}

const pendingSend = { id: 'send-1', post_id: 'post-1' }
const subscriber = {
  id: 'sub-1',
  email: 'reader@example.com',
  unsubscribe_token: 'tok',
  subscribed_at: '2026-01-01T00:00:00Z',
  unsubscribed_at: null,
}
const post = { ...validPost, status: 'published', cover_image_alt: 'Annotated circuit board' }

function makeSupabase({
  pendingSends = [pendingSend] as typeof pendingSend[],
  claimedSends = [pendingSend] as typeof pendingSend[],
  subscribers = [subscriber] as typeof subscriber[],
  postData = post as typeof post | null,
  fetchPendingError = null as { message: string } | null,
  claimError = null as { message: string } | null,
  sendStatuses = ['sending'],
  editedPost = null as typeof post | null,
} = {}) {
  const fromMock = vi.fn()
  let dispatchToken: string

  fromMock.mockReturnValueOnce({
    update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
    lt: vi.fn().mockResolvedValue({ error: null }),
  })

  // Call 1: stuck-sending recovery (.update.eq.lt)
  fromMock.mockReturnValueOnce({
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockResolvedValue({ error: null }),
  })

  // Call 2: fetch pending sends (.select.eq.lte.limit)
  fromMock.mockReturnValueOnce({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: fetchPendingError ? null : pendingSends, error: fetchPendingError }),
  })

  // Call 3: claim sends (.update.in.eq.lte.select)
  fromMock.mockReturnValueOnce({
    update: vi.fn().mockImplementation(function (this: unknown, payload: { dispatch_token: string }) { dispatchToken = payload.dispatch_token; return this }),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue({ data: claimError ? null : claimedSends, error: claimError }),
  })

  let statusRead = 0
  let postRead = 0
  // Subsequent status checks and completion writes.
  fromMock.mockReturnValue({
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(async () => ({ data: { status: sendStatuses[Math.min(statusRead++, sendStatuses.length - 1)], dispatch_token: dispatchToken }, error: null })),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [pendingSend], error: null }).then(resolve),
  })

  return { from: vi.fn((table: string) => {
    if (table === 'newsletter_subscriptions') return { select: vi.fn().mockReturnThis(), is: vi.fn().mockResolvedValue({ data: subscribers, error: null }) }
    if (table === 'profiles') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { full_name: 'Frank Mendez' }, error: null }) }
    if (table === 'posts') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: postRead++ > 0 && editedPost ? editedPost : postData, error: postData ? null : { message: 'not found' } }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
    return fromMock()
  }) } as unknown as ReturnType<typeof createServiceClient>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('WEBHOOK_SECRET', WEBHOOK_SECRET)
  vi.stubEnv('CRON_SECRET', 'vercel-cron-secret')
  vi.stubEnv('RESEND_API_KEY', 'mock-key')
  vi.stubEnv('RESEND_FROM_EMAIL', 'mock@example.com')
})

describe('GET /api/newsletter/send (Vercel Cron)', () => {
  function cronRequest(authorization?: string, webhookSecret?: string) {
    const headers = new Headers()
    if (authorization) headers.set('authorization', authorization)
    if (webhookSecret) headers.set('x-webhook-secret', webhookSecret)
    return new Request('http://localhost/api/newsletter/send', { headers }) as unknown as import('next/server').NextRequest
  }

  it.each([undefined, 'Bearer wrong-secret', 'Basic vercel-cron-secret', 'vercel-cron-secret', 'Bearer '])('rejects invalid authorization %s before accessing the database', async authorization => {
    expect((await GET(cronRequest(authorization))).status).toBe(401)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('does not accept the external webhook secret for GET', async () => {
    expect((await GET(cronRequest(undefined, WEBHOOK_SECRET))).status).toBe(401)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('fails closed if CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await GET(cronRequest('Bearer vercel-cron-secret'))).status).toBe(500)
    expect(log).toHaveBeenCalledWith('[newsletter/send] CRON_SECRET is not configured')
    log.mockRestore()
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('dispatches due notifications with the Vercel bearer secret', async () => {
    mockSendNewsletterEmail.mockResolvedValue(undefined)
    mockCreateServiceClient.mockReturnValue(makeSupabase())
    const response = await GET(cronRequest('Bearer vercel-cron-secret'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ dispatched: 1 })
    expect(mockSendNewsletterEmail).toHaveBeenCalledWith(subscriber, post)
  })
})

describe('POST /api/newsletter/send', () => {
  it('names WEBHOOK_SECRET when the external scheduler is misconfigured', async () => {
    vi.stubEnv('WEBHOOK_SECRET', '')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await POST(makeReq(WEBHOOK_SECRET))).status).toBe(500)
    expect(log).toHaveBeenCalledWith('[newsletter/send] WEBHOOK_SECRET is not configured')
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('returns 401 when webhook secret is missing', async () => {
    mockCreateServiceClient.mockReturnValue(makeSupabase())
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 401 for wrong webhook secret', async () => {
    mockCreateServiceClient.mockReturnValue(makeSupabase())
    const res = await POST(makeReq('wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns dispatched: 0 when no pending sends', async () => {
    mockCreateServiceClient.mockReturnValue(makeSupabase({ pendingSends: [] }))
    const res = await POST(makeReq(WEBHOOK_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.dispatched).toBe(0)
  })

  it('returns dispatched: 0 when claim returns empty (race condition)', async () => {
    mockCreateServiceClient.mockReturnValue(makeSupabase({ claimedSends: [] }))
    const res = await POST(makeReq(WEBHOOK_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.dispatched).toBe(0)
  })

  it('dispatches emails and returns count', async () => {
    mockSendNewsletterEmail.mockResolvedValue(undefined)
    mockCreateServiceClient.mockReturnValue(makeSupabase())
    const res = await POST(makeReq(WEBHOOK_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.dispatched).toBe(1)
    expect(mockSendNewsletterEmail).toHaveBeenCalledWith(subscriber, post)
  })

  it('marks send as failed when email sending fails', async () => {
    mockSendNewsletterEmail.mockRejectedValue(new Error('Resend error'))
    const supabase = makeSupabase()
    mockCreateServiceClient.mockReturnValue(supabase)
    const res = await POST(makeReq(WEBHOOK_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.dispatched).toBe(0)
  })

  it('stops later batches after a claimed notification is canceled', async () => {
    mockSendNewsletterEmail.mockResolvedValue(undefined)
    mockCreateServiceClient.mockReturnValue(makeSupabase({ subscribers: Array.from({ length: 12 }, () => subscriber), sendStatuses: ['sending', 'failed'] }))
    const res = await POST(makeReq(WEBHOOK_SECRET))
    expect((await res.json()).dispatched).toBe(0)
    expect(mockSendNewsletterEmail).toHaveBeenCalledTimes(10)
  })

  it('finishes every batch using the reviewed snapshot after a live edit', async () => {
    mockSendNewsletterEmail.mockResolvedValue(undefined)
    mockCreateServiceClient.mockReturnValue(makeSupabase({
      subscribers: Array.from({ length: 12 }, () => subscriber),
      editedPost: { ...post, title: 'Reviewed correction to an integration article', updated_at: '2026-10-07T00:00:00Z' },
    }))
    const res = await POST(makeReq(WEBHOOK_SECRET))
    expect((await res.json()).dispatched).toBe(1)
    expect(mockSendNewsletterEmail).toHaveBeenCalledTimes(12)
    for (const call of mockSendNewsletterEmail.mock.calls) expect(call[1]).toEqual(post)
  })

  it('returns 500 when DB fetch fails', async () => {
    mockCreateServiceClient.mockReturnValue(
      makeSupabase({ fetchPendingError: { message: 'connection refused' } })
    )
    const res = await POST(makeReq(WEBHOOK_SECRET))
    expect(res.status).toBe(500)
  })
})

describe('newsletter publication safeguards', () => {
  it.each([
    null,
    { ...post, status: 'draft' },
    { ...post, title: 'hello this is for test' },
    { ...post, content: '<p><br></p>' },
    { ...post, content: post.content + '<p>lorem ipsum</p>' },
  ])('never emails removed, unpublished or unready articles', async postData => {
    mockCreateServiceClient.mockReturnValue(makeSupabase({ postData }))
    const res = await POST(makeReq(WEBHOOK_SECRET))
    expect((await res.json()).dispatched).toBe(0)
    expect(mockSendNewsletterEmail).not.toHaveBeenCalled()
  })
})

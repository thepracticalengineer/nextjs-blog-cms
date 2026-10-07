import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/features/posts/cache', () => ({ refreshPostPaths: vi.fn(), refreshDraftPaths: vi.fn() }))
vi.mock('@/features/newsletter/actions', () => ({ scheduleNewsletterSend: vi.fn(), cancelNewsletterSend: vi.fn() }))

vi.mock('@/lib/apiAuth', () => ({ requireApiKey: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true }) }))
vi.mock('@/features/api-keys/apiKeyService', () => ({
  resolveTagIds: vi.fn().mockResolvedValue([]),
  resolveCategoryId: vi.fn().mockResolvedValue(null),
  generateUniqueSlugForApi: vi.fn().mockResolvedValue('new-slug'),
  hashApiKey: vi.fn().mockReturnValue('hashed-key'),
}))

import { postClient, validPost } from '../helpers/publication'
import { scheduleNewsletterSend, cancelNewsletterSend } from '@/features/newsletter/actions'
import { refreshPostPaths } from '@/features/posts/cache'
import { GET, PATCH, DELETE } from '@/app/api/posts/[id]/route'
import { requireApiKey } from '@/lib/apiAuth'
import { createServiceClient } from '@/lib/supabase/service'

const mockRequireApiKey = vi.mocked(requireApiKey)
const mockCreateServiceClient = vi.mocked(createServiceClient)

type RouteContext = { params: Promise<{ id: string }> }

function makeParams(id: string): RouteContext {
  return { params: Promise.resolve({ id }) }
}

function makeReq(method: string, body?: unknown): import('next/server').NextRequest {
  return new Request('http://localhost/api/posts/post-1', {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer fmblog_test',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as unknown as import('next/server').NextRequest
}

const fakePost = {
  id: 'post-1', title: 'My Post', slug: 'my-post',
  content: '<p>Hello</p>', excerpt: 'Hello',
  seo_title: 'SEO title', seo_description: 'SEO desc',
  status: 'draft', cover_image: null, author_id: 'user-1',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  published_at: null,
  category: { name: 'Tech' },
  tags: [{ tag: { name: 'ai' } }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireApiKey.mockResolvedValue({ success: true, userId: 'user-1' })
})

// ─── GET ──────────────────────────────────────────────────────────────────────

describe('GET /api/posts/[id]', () => {
  it('returns 401 when no auth', async () => {
    mockRequireApiKey.mockResolvedValue({
      success: false,
      error: 'Missing Authorization header. Expected: Bearer <api_key>',
      status: 401,
    })
    const res = await GET(makeReq('GET'), makeParams('post-1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when post not found', async () => {
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'Not found' } }),
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createServiceClient>)

    const res = await GET(makeReq('GET'), makeParams('nonexistent'))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Post not found.')
  })

  it('returns full normalized post', async () => {
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: fakePost, error: null }),
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createServiceClient>)

    const res = await GET(makeReq('GET'), makeParams('post-1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.title).toBe('My Post')
    expect(json.data.category).toBe('Tech')
    expect(json.data.tags).toEqual(['ai'])
    expect(json.data.author_id).toBeUndefined()
    expect(json.data.meta_title).toBe('SEO title')
    expect(json.data.image_url).toBeNull()
  })
})

// ─── PATCH ────────────────────────────────────────────────────────────────────

describe('PATCH /api/posts/[id]', () => {
  it('returns 404 for a nonexistent or foreign post', async () => {
    vi.mocked(createServiceClient).mockReturnValue(postClient([{ ...validPost, author_id: 'other-user' }]).client)
    expect((await PATCH(makeReq('PATCH', { title: 'New' }), makeParams('post-1'))).status).toBe(404)
  })
  it('allows incomplete draft updates', async () => {
    const db = postClient([validPost])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    expect((await PATCH(makeReq('PATCH', { title: '', content: '' }), makeParams('post-1'))).status).toBe(200)
    expect(db.posts[0]).toMatchObject({ title: '', content: '', status: 'draft' })
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it('validates stored content when only status is supplied', async () => {
    const db = postClient([fakePost])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    const res = await PATCH(makeReq('PATCH', { status: 'published', editorial_reviewed: true }), makeParams('post-1'))
    expect(res.status).toBe(422)
    expect((await res.json()).details.field_errors.content).toBeDefined()
    expect(db.posts[0]).toEqual(fakePost)
    expect(db.writes).toEqual([])
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it.each([
    { title: 'hello this is for test' }, { content: '<p>&nbsp;</p>' }, { excerpt: '' },
    { content: validPost.content + '<p>lorem ipsum</p>' }, { slug: 'INVALID SLUG' },
  ])('rejects invalid live edits even without a status field', async patch => {
    const original = { ...validPost, status: 'published', published_at: '2026-01-01T00:00:00Z' }
    const db = postClient([original])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    const res = await PATCH(makeReq('PATCH', { ...patch, editorial_reviewed: true, tags: ['new-tag'] }), makeParams('post-1'))
    expect(res.status).toBe(422)
    expect(db.posts[0]).toEqual(original)
    expect(db.writes).toEqual([])
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it('requires human review for live edits', async () => {
    const db = postClient([{ ...validPost, status: 'published' }])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    const res = await PATCH(makeReq('PATCH', { title: 'Another Useful Engineering Article' }), makeParams('post-1'))
    expect(res.status).toBe(422)
    expect((await res.json()).details.field_errors.editorial_reviewed).toBeDefined()
    expect(db.writes).toEqual([])
  })
  it('publishes a valid draft and schedules exactly one newsletter', async () => {
    const db = postClient([validPost])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    const res = await PATCH(makeReq('PATCH', { status: 'published', editorial_reviewed: true }), makeParams('post-1'))
    expect(res.status).toBe(200)
    expect(db.posts[0]).toMatchObject({ status: 'published', published_at: expect.any(String) })
    expect(scheduleNewsletterSend).toHaveBeenCalledExactlyOnceWith('post-1')
  })
  it('preserves the original publication timestamp and does not requeue live edits', async () => {
    const db = postClient([{ ...validPost, status: 'published', published_at: '2026-01-01T00:00:00Z' }])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    const res = await PATCH(makeReq('PATCH', { slug: 'new-engineering-slug', editorial_reviewed: true, confirm_slug_change: true }), makeParams('post-1'))
    expect(res.status).toBe(200)
    expect(db.posts[0].published_at).toBe('2026-01-01T00:00:00Z')
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
    expect(refreshPostPaths).toHaveBeenCalledWith(validPost.slug, 'new-engineering-slug')
  })
  it('unpublishes even incomplete legacy content and cancels pending notifications', async () => {
    const db = postClient([{ ...fakePost, status: 'published', published_at: '2026-01-01T00:00:00Z' }])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    const res = await PATCH(makeReq('PATCH', { status: 'draft' }), makeParams('post-1'))
    expect(res.status).toBe(200)
    expect(db.posts[0]).toMatchObject({ status: 'draft', published_at: null })
    expect(cancelNewsletterSend).toHaveBeenCalledWith('post-1')
  })
  it.each([{ title: null }, { slug: 123 }, { tags: {} }, { status: 'scheduled' }])('returns structured errors for malformed fields %j', async body => {
    const db = postClient([validPost])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    expect((await PATCH(makeReq('PATCH', body), makeParams('post-1'))).status).toBe(422)
    expect(db.writes).toEqual([])
  })
  it('does not publish or queue when a concurrent change prevents the checked write', async () => {
    const db = postClient([validPost]); db.simulateRace()
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    expect((await PATCH(makeReq('PATCH', { status: 'published', editorial_reviewed: true }), makeParams('post-1'))).status).toBe(409)
    expect(db.posts[0]).toEqual(validPost)
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
})

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe('DELETE /api/posts/[id]', () => {
  it('returns 404 when not found or wrong user', async () => {
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createServiceClient>)

    const res = await DELETE(makeReq('DELETE'), makeParams('post-1'))
    expect(res.status).toBe(404)
  })

  it('returns 200 and message on success', async () => {
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'post-1' }, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createServiceClient>)

    const res = await DELETE(makeReq('DELETE'), makeParams('post-1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.message).toBe('Post deleted successfully.')
  })
})

it('returns a slug field error for a PATCH uniqueness race', async () => {
  const db = postClient([validPost]); db.simulateSlugRace()
  mockCreateServiceClient.mockReturnValue(db.client)
  const response = await PATCH(makeReq('PATCH', { slug: 'race-url' }), makeParams(validPost.id))
  expect(response.status).toBe(409)
  expect((await response.json()).details.field_errors.slug[0]).toContain('Choose another')
  expect(db.posts[0].slug).toBe(validPost.slug)
})
it('requires explicit URL confirmation even when publication review is confirmed', async () => {
  const db = postClient([{ ...validPost, status: 'published' }])
  mockCreateServiceClient.mockReturnValue(db.client)
  const response = await PATCH(makeReq('PATCH', { slug: 'new-public-url', editorial_reviewed: true }), makeParams(validPost.id))
  expect(response.status).toBe(422)
  expect((await response.json()).details.field_errors.slug[0]).toContain('Confirm')
  expect(db.writes).toHaveLength(0)
})

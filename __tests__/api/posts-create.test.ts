import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/features/api-keys/apiKeyService', () => ({
  validateApiKey: vi.fn(), resolveTagIds: vi.fn().mockResolvedValue([]),
  resolveCategoryId: vi.fn().mockResolvedValue(null), generateUniqueSlugForApi: vi.fn().mockResolvedValue('new-article'),
}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/features/posts/cache', () => ({ refreshPostPaths: vi.fn() }))
vi.mock('@/features/newsletter/actions', () => ({ scheduleNewsletterSend: vi.fn() }))

import { POST } from '@/app/api/posts/create/route'
import { validateApiKey } from '@/features/api-keys/apiKeyService'
import { createServiceClient } from '@/lib/supabase/service'
import { scheduleNewsletterSend } from '@/features/newsletter/actions'
import { postClient, validPost } from '../helpers/publication'

const validApiPost = { title: validPost.title, slug: validPost.slug, content: validPost.content, excerpt: validPost.excerpt, tags: ['testing'] }

function request(body: unknown, auth = 'Bearer fmblog_valid') {
  return new Request('http://localhost/api/posts/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body),
  })
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(validateApiKey).mockResolvedValue('user-1') })

describe('POST /api/posts/create', () => {
  it('requires authorization and a valid API key', async () => {
    expect((await POST(request({}, ''))).status).toBe(401)
    vi.mocked(validateApiKey).mockResolvedValue(null)
    expect((await POST(request({}))).status).toBe(401)
  })
  it('allows incomplete work as a draft', async () => {
    const db = postClient()
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    expect((await POST(request({}))).status).toBe(201)
    expect(db.posts[0]).toMatchObject({ title: '', content: '', status: 'draft', author_id: 'user-1' })
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it.each([
    {}, { title: '   ', content: '   ' }, { title: 'hello this is for test', content: '<p><br></p>' },
    { title: validPost.title, content: '<p>' + 'lorem ipsum '.repeat(200) + '</p>' },
    { ...validApiPost, slug: 'INVALID SLUG' }, { ...validApiPost, editorial_reviewed: false },
  ])('blocks an incomplete or placeholder publication before any writes', async fields => {
    const db = postClient()
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    const res = await POST(request({ editorial_reviewed: true, ...fields, status: 'published' }))
    expect(res.status).toBe(422)
    expect((await res.json()).details.field_errors).toBeDefined()
    expect(db.writes).toEqual([])
    expect(scheduleNewsletterSend).not.toHaveBeenCalled()
  })
  it.each([null, [], { title: 7 }, { content: {} }, { status: 'anything' }, { editorial_reviewed: 'true' }])('rejects malformed JSON fields %j', async body => {
    const res = await POST(request(body))
    expect(res.status).toBe(422)
    expect(createServiceClient).not.toHaveBeenCalled()
  })
  it('publishes a reviewed engineering article and queues its newsletter', async () => {
    const db = postClient()
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    const res = await POST(request({ ...validApiPost, status: 'published', editorial_reviewed: true }))
    expect(res.status).toBe(201)
    expect(db.posts[0]).toMatchObject({ status: 'published', title: validPost.title })
    expect(scheduleNewsletterSend).toHaveBeenCalledWith('created-post')
  })
  it('cannot publish under a missing or unnamed author', async () => {
    const db = postClient([], null)
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    const res = await POST(request({ ...validApiPost, status: 'published', editorial_reviewed: true }))
    expect(res.status).toBe(422)
    expect((await res.json()).details.field_errors.author_id).toBeDefined()
    expect(db.writes).toEqual([])
  })
  it('returns a field error for a duplicate slug without publishing', async () => {
    const db = postClient([validPost])
    vi.mocked(createServiceClient).mockReturnValue(db.client)
    const res = await POST(request({ ...validApiPost, status: 'published', editorial_reviewed: true }))
    expect(res.status).toBe(422)
    expect((await res.json()).details.field_errors.slug).toBeDefined()
    expect(db.writes).toEqual([])
  })
})

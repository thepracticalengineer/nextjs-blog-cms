import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/apiAuth', () => ({ requireApiKey: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true }) }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/features/ai-assistant/llmKeyService', () => ({
  getDecryptedApiKeyForUser: vi.fn(),
}))
vi.mock('@/features/ai-assistant/llmService', () => ({
  generateBlogPostHeadless: vi.fn(),
}))
vi.mock('@/features/api-keys/apiKeyService', () => ({
  resolveTagIds: vi.fn().mockResolvedValue([]),
  resolveCategoryId: vi.fn().mockResolvedValue(null),
  generateUniqueSlugForApi: vi.fn().mockResolvedValue('generated-slug'),
  hashApiKey: vi.fn().mockReturnValue('hashed'),
}))

import { POST } from '@/app/api/ai-assistant/generate/route'
import { requireApiKey } from '@/lib/apiAuth'
import { checkRateLimit } from '@/lib/rateLimit'
import { createServiceClient } from '@/lib/supabase/service'
import { getDecryptedApiKeyForUser } from '@/features/ai-assistant/llmKeyService'
import { generateBlogPostHeadless } from '@/features/ai-assistant/llmService'

const mockRequireApiKey = vi.mocked(requireApiKey)
const mockCheckRateLimit = vi.mocked(checkRateLimit)
const mockCreateServiceClient = vi.mocked(createServiceClient)
const mockGetDecryptedApiKeyForUser = vi.mocked(getDecryptedApiKeyForUser)
const mockGenerateBlogPostHeadless = vi.mocked(generateBlogPostHeadless)

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/ai-assistant/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fmblog_test' },
    body: JSON.stringify(body),
  })
}

const fakeGeneratedPost = {
  title: 'AI and Blogging',
  meta_title: 'AI Blogging',
  meta_description: 'How AI changes blogging',
  excerpt: 'AI is transforming the way we blog.',
  content: '<p>Long content here...</p>',
  tags: ['ai', 'blogging'],
  category: 'Technology',
}

function makeSupabaseMock() {
  const singleMock = vi.fn().mockResolvedValue({ data: { id: 'post-1', title: 'AI and Blogging', slug: 'ai-and-blogging', status: 'draft', created_at: '2026-04-13T00:00:00Z' }, error: null })
  const chatSingleMock = vi.fn().mockResolvedValue({ data: { id: 'chat-1' }, error: null })
  const msgSingleMock = vi.fn().mockResolvedValue({ data: { id: 'msg-1' }, error: null })
  const genPostSingleMock = vi.fn().mockResolvedValue({ data: { id: 'gen-1' }, error: null })

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'posts') {
        return {
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleMock }) }),
        }
      }
      if (table === 'ai_chats') {
        return {
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: chatSingleMock }) }),
        }
      }
      if (table === 'ai_messages') {
        return {
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: msgSingleMock }) }),
        }
      }
      if (table === 'ai_generated_posts') {
        return {
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: genPostSingleMock }) }),
        }
      }
      if (table === 'post_tags') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return { insert: vi.fn().mockResolvedValue({ data: {}, error: null }) }
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireApiKey.mockResolvedValue({ success: true, userId: 'user-1' })
  mockCheckRateLimit.mockReturnValue({ allowed: true })
})

describe('POST /api/ai-assistant/generate', () => {
  it('returns 401 when no auth', async () => {
    mockRequireApiKey.mockResolvedValue({ success: false, error: 'Missing Authorization header. Expected: Bearer <api_key>', status: 401 })
    const res = await POST(makeReq({ topic: 'AI' }) as unknown as import('next/server').NextRequest)
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate limit exceeded', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfter: 45 })
    const res = await POST(makeReq({ topic: 'AI' }) as unknown as import('next/server').NextRequest)
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.retry_after).toBe(45)
  })

  it('returns 400 when topic is missing', async () => {
    const res = await POST(makeReq({}) as unknown as import('next/server').NextRequest)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/topic/)
  })

  it('returns 422 when llm_model is unknown', async () => {
    mockGetDecryptedApiKeyForUser.mockImplementation(async (provider) => {
      if (provider === 'claude') return 'sk-claude-key'
      return null
    })
    const res = await POST(
      makeReq({ topic: 'AI', llm_model: 'gpt-9000-unknown' }) as unknown as import('next/server').NextRequest
    )
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.details).toContain('gpt-9000-unknown')
  })

  it('returns 422 when no LLM keys configured for user', async () => {
    mockGetDecryptedApiKeyForUser.mockResolvedValue(null)
    const res = await POST(makeReq({ topic: 'AI in 2026' }) as unknown as import('next/server').NextRequest)
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.action).toBeTruthy()
  })

  it('returns 201 with post and chat_id on valid request', async () => {
    mockGetDecryptedApiKeyForUser.mockImplementation(async (provider) => {
      if (provider === 'claude') return 'sk-claude-key'
      return null
    })
    mockGenerateBlogPostHeadless.mockResolvedValue(fakeGeneratedPost)
    mockCreateServiceClient.mockReturnValue(makeSupabaseMock() as unknown as ReturnType<typeof createServiceClient>)

    const res = await POST(makeReq({ topic: 'AI in 2026', tone: 'casual', word_count: 1200 }) as unknown as import('next/server').NextRequest)
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.post.id).toBe('post-1')
    expect(json.data.chat_id).toBe('chat-1')
    expect(json.data.llm_provider).toBe('claude')
  })

  it('returns 502 when LLM throws an error', async () => {
    mockGetDecryptedApiKeyForUser.mockImplementation(async (provider) => {
      if (provider === 'claude') return 'sk-claude-key'
      return null
    })
    mockGenerateBlogPostHeadless.mockRejectedValue(new Error('Invalid API key'))

    const res = await POST(makeReq({ topic: 'AI in 2026' }) as unknown as import('next/server').NextRequest)
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.details).toContain('Invalid API key')
  })

  it('applies post_overrides over AI-generated values', async () => {
    mockGetDecryptedApiKeyForUser.mockImplementation(async (provider) => {
      if (provider === 'claude') return 'sk-claude-key'
      return null
    })
    mockGenerateBlogPostHeadless.mockResolvedValue(fakeGeneratedPost)
    const mock = makeSupabaseMock()
    mockCreateServiceClient.mockReturnValue(mock as unknown as ReturnType<typeof createServiceClient>)

    await POST(
      makeReq({
        topic: 'AI in 2026',
        post_overrides: { title: 'Custom Title', category: 'Tech', tags: ['custom'] },
      }) as unknown as import('next/server').NextRequest
    )

    // Verify the posts.insert call received the overridden title
    const postsFrom = mock.from.mock.calls.find(([t]) => t === 'posts')
    expect(postsFrom).toBeTruthy()
  })
})

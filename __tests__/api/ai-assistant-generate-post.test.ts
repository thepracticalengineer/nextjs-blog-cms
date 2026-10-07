import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/features/ai-assistant/chatService', () => ({
  getChat: vi.fn().mockResolvedValue({ user_id: 'user-1', book_id: 'book-1', llm_provider: 'claude', llm_model: 'fixture' }),
  getMessages: vi.fn().mockResolvedValue([{ id: 'message-1', role: 'user', content: 'Write a draft' }]),
  getBookById: vi.fn().mockResolvedValue({ extracted_text: 'Book text' }),
}))
vi.mock('@/features/ai-assistant/llmService', () => ({ generateBlogPost: vi.fn().mockResolvedValue({ title: 'Generated Engineering Draft', content: '<p>Generated text</p>', tags: [] }) }))
vi.mock('@/features/ai-assistant/llmKeyService', () => ({ getDecryptedApiKey: vi.fn().mockResolvedValue('fixture-key') }))
vi.mock('@/features/api-keys/apiKeyService', () => ({ resolveCategoryId: vi.fn().mockResolvedValue(null) }))
import { POST } from '@/app/api/ai-assistant/chats/[chatId]/generate-post/route'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateBlogPost } from '@/features/ai-assistant/llmService'
import { postClient } from '../helpers/publication'
import type { NextRequest } from 'next/server'
const context = { params: Promise.resolve({ chatId: 'chat-1' }) }
function request(key?: string) {
  return new Request('http://localhost/api/ai-assistant/chats/chat-1/generate-post', {
    method: 'POST', headers: key ? { 'Idempotency-Key': key } : {},
  }) as NextRequest
}
beforeEach(() => vi.clearAllMocks())
function useDb() {
  const db = postClient()
  vi.mocked(createServiceClient).mockReturnValue(db.client)
  vi.mocked(createClient).mockResolvedValue({ ...db.client, auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } } as unknown as Awaited<ReturnType<typeof createClient>>)
  return db
}
it('allows keyless regeneration on an unchanged chat', async () => {
  const db = useDb()
  expect((await POST(request(), context)).status).toBe(200)
  expect((await POST(request(), context)).status).toBe(200)
  expect(generateBlogPost).toHaveBeenCalledTimes(2)
  expect(db.posts).toHaveLength(2)
})
it('replays a keyed attempt and allows a fresh key to generate again', async () => {
  const db = useDb()
  await POST(request('attempt-1'), context)
  const retry = await POST(request('attempt-1'), context)
  expect(retry.headers.get('Idempotent-Replayed')).toBe('true')
  expect(generateBlogPost).toHaveBeenCalledTimes(1)
  await POST(request('attempt-2'), context)
  expect(generateBlogPost).toHaveBeenCalledTimes(2)
  expect(db.posts).toHaveLength(2)
})
it('returns 503 before generation when receipt lookup fails', async () => {
  const db = useDb()
  vi.mocked(db.client.from).mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'Database unavailable' } }) }) }) }) } as unknown as ReturnType<typeof db.client.from>)
  expect((await POST(request('attempt-1'), context)).status).toBe(503)
  expect(generateBlogPost).not.toHaveBeenCalled()
})

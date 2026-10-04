// __tests__/api/ai-assistant-messages.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/features/ai-assistant/chatService', () => ({
  getChat: vi.fn(),
  getMessages: vi.fn(),
  addMessage: vi.fn(),
  updateChatLastMessage: vi.fn(),
  updateChatTitle: vi.fn(),
  getBookById: vi.fn(),
}))
vi.mock('@/features/ai-assistant/llmService', () => ({
  sendMessage: vi.fn(),
  generateChatTitle: vi.fn(),
  isRateLimitError: vi.fn(),
}))
vi.mock('@/features/ai-assistant/llmKeyService', () => ({
  getDecryptedApiKey: vi.fn(),
}))

import { POST } from '@/app/api/ai-assistant/chats/[chatId]/messages/route'
import { createClient } from '@/lib/supabase/server'
import { getChat, getMessages, addMessage, getBookById } from '@/features/ai-assistant/chatService'
import { sendMessage, isRateLimitError } from '@/features/ai-assistant/llmService'
import { getDecryptedApiKey } from '@/features/ai-assistant/llmKeyService'
import type { AIChat, AIBook } from '@/features/ai-assistant/types'

const mockCreateClient = vi.mocked(createClient)
const mockGetChat = vi.mocked(getChat)
const mockGetMessages = vi.mocked(getMessages)
const mockAddMessage = vi.mocked(addMessage)
const mockGetBookById = vi.mocked(getBookById)
const mockSendMessage = vi.mocked(sendMessage)
const mockIsRateLimitError = vi.mocked(isRateLimitError)
const mockGetDecryptedApiKey = vi.mocked(getDecryptedApiKey)

function makeAuthMock(userId = 'user-1') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
  }
}

function makePostRequest(body: object): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest
}

const fakeChat: AIChat = {
  id: 'chat-1',
  user_id: 'user-1',
  book_id: 'book-1',
  title: 'Test Chat',
  llm_provider: 'claude',
  llm_model: 'claude-sonnet-4-6',
  last_message_at: null,
  created_at: '2026-04-14T10:00:00Z',
  updated_at: '2026-04-14T10:00:00Z',
}

const fakeBook: AIBook = {
  id: 'book-1',
  user_id: 'user-1',
  title: 'Test Book',
  file_name: 'test.pdf',
  page_count: 10,
  extracted_text: 'Some book content here.',
  word_count: 100,
  char_count: 500,
  created_at: '2026-04-14T10:00:00Z',
  updated_at: '2026-04-14T10:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetMessages.mockResolvedValue([])
  mockGetDecryptedApiKey.mockResolvedValue('test-api-key')
  mockGetBookById.mockResolvedValue(fakeBook)
  mockIsRateLimitError.mockReturnValue(false)
})

describe('POST /api/ai-assistant/chats/[chatId]/messages — pre-flight', () => {
  it('returns 429 and does NOT persist the user message when provider throws a rate-limit error', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock() as unknown as Awaited<ReturnType<typeof createClient>>)
    mockGetChat.mockResolvedValue(fakeChat)
    mockIsRateLimitError.mockReturnValue(true)

    async function* rateLimitGen() {
      throw new Error('Rate limit exceeded')
      yield '' // make TS happy
    }
    mockSendMessage.mockReturnValue(rateLimitGen())

    const res = await POST(makePostRequest({ content: 'Hello' }), { params: Promise.resolve({ chatId: 'chat-1' }) })

    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.error).toMatch(/rate limit/i)
    // User message must NOT have been persisted
    expect(mockAddMessage).not.toHaveBeenCalled()
  })

  it('returns 502 and does NOT persist the user message when the stream is immediately done (empty)', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock() as unknown as Awaited<ReturnType<typeof createClient>>)
    mockGetChat.mockResolvedValue(fakeChat)

    async function* emptyGen() {
      // yields nothing
    }
    mockSendMessage.mockReturnValue(emptyGen())

    const res = await POST(makePostRequest({ content: 'Hello' }), { params: Promise.resolve({ chatId: 'chat-1' }) })

    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toMatch(/failed to get a response/i)
    expect(mockAddMessage).not.toHaveBeenCalled()
  })

  it('returns 502 and does NOT persist the user message when the provider throws a non-rate-limit error', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock() as unknown as Awaited<ReturnType<typeof createClient>>)
    mockGetChat.mockResolvedValue(fakeChat)
    mockIsRateLimitError.mockReturnValue(false)

    async function* failingGen() {
      throw new Error('Internal provider error')
      yield ''
    }
    mockSendMessage.mockReturnValue(failingGen())

    const res = await POST(makePostRequest({ content: 'Hello' }), { params: Promise.resolve({ chatId: 'chat-1' }) })

    expect(res.status).toBe(502)
    expect(mockAddMessage).not.toHaveBeenCalled()
  })
})

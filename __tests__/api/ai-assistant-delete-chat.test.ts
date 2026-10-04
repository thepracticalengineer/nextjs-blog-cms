// __tests__/api/ai-assistant-delete-chat.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/features/ai-assistant/chatService', () => ({
  getChat: vi.fn(),
  deleteChat: vi.fn(),
}))

import { DELETE } from '@/app/api/ai-assistant/chats/[chatId]/route'
import { createClient } from '@/lib/supabase/server'
import { getChat, deleteChat } from '@/features/ai-assistant/chatService'
import type { AIChat } from '@/features/ai-assistant/types'

const mockCreateClient = vi.mocked(createClient)
const mockGetChat = vi.mocked(getChat)
const mockDeleteChat = vi.mocked(deleteChat)

function makeAuthMock(userId = 'user-1') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
  }
}

function makeRequest(): NextRequest {
  return new Request('http://localhost/api/ai-assistant/chats/chat-1') as unknown as NextRequest
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

beforeEach(() => vi.clearAllMocks())

describe('DELETE /api/ai-assistant/chats/[chatId]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as unknown as Awaited<ReturnType<typeof createClient>>)

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ chatId: 'chat-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when chat does not exist', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock() as unknown as Awaited<ReturnType<typeof createClient>>)
    mockGetChat.mockResolvedValue(null)

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ chatId: 'chat-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 404 when chat belongs to a different user', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock('other-user') as unknown as Awaited<ReturnType<typeof createClient>>)
    mockGetChat.mockResolvedValue(fakeChat)

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ chatId: 'chat-1' }) })
    expect(res.status).toBe(404)
  })

  it('deletes the chat and returns 200 on success', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock() as unknown as Awaited<ReturnType<typeof createClient>>)
    mockGetChat.mockResolvedValue(fakeChat)
    mockDeleteChat.mockResolvedValue(undefined)

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ chatId: 'chat-1' }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(mockDeleteChat).toHaveBeenCalledWith('chat-1', 'user-1')
  })
})

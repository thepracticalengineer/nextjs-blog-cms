vi.mock('@/lib/auth/session', async () => ({ authorizeSession: (await import('../helpers/session')).routeTestSession }))
// __tests__/api/ai-assistant-chats-route.test.ts
// Tests for app/api/ai-assistant/chats/route.ts (POST create chat, GET list chats)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/features/ai-assistant/chatService', () => ({
  createChat: vi.fn(),
  getChats: vi.fn(),
}))

import { POST, GET } from '@/app/api/ai-assistant/chats/route'
import { createClient } from '@/lib/supabase/server'
import { createChat, getChats } from '@/features/ai-assistant/chatService'

const mockCreateClient = vi.mocked(createClient)
const mockCreateChat = vi.mocked(createChat)
const mockGetChats = vi.mocked(getChats)

function makeAuthMock(userId: string | null = 'user-1') {
  const bookQuery: any = {
    single: vi.fn().mockResolvedValue({ data: userId ? { id: 'book-1' } : null }),
  }
  bookQuery.eq = vi.fn().mockReturnValue(bookQuery)
  bookQuery.select = vi.fn().mockReturnValue(bookQuery)

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
    from: vi.fn().mockReturnValue(bookQuery),
  }
}

function makeRequest(body: object): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

beforeEach(() => { vi.clearAllMocks() })

describe('POST /api/ai-assistant/chats', () => {
  it('returns 401 when not authenticated', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock(null) as any)
    const res = await POST(makeRequest({ book_id: 'book-1', llm_provider: 'claude', llm_model: 'claude-sonnet-4-6' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when book_id is missing', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock('u1') as any)
    const res = await POST(makeRequest({ llm_provider: 'claude', llm_model: 'claude-sonnet-4-6' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/book_id/i)
  })

  it('returns 400 for an invalid llm_provider', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock('u1') as any)
    const res = await POST(makeRequest({ book_id: 'book-1', llm_provider: 'invalid-provider', llm_model: 'some-model' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/llm_provider/i)
  })

  it('returns 400 for a valid provider with a mismatched model', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock('u1') as any)
    const res = await POST(makeRequest({ book_id: 'book-1', llm_provider: 'claude', llm_model: 'gpt-4o' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/llm_model/i)
  })

  it('returns 404 when the book does not belong to the user', async () => {
    const supabase = makeAuthMock('u1')
    // Override the book query to return null
    const noBookQuery: any = { single: vi.fn().mockResolvedValue({ data: null }) }
    noBookQuery.eq = vi.fn().mockReturnValue(noBookQuery)
    noBookQuery.select = vi.fn().mockReturnValue(noBookQuery)
    supabase.from = vi.fn().mockReturnValue(noBookQuery)
    mockCreateClient.mockResolvedValue(supabase as any)

    const res = await POST(makeRequest({ book_id: 'book-1', llm_provider: 'claude', llm_model: 'claude-sonnet-4-6' }))
    expect(res.status).toBe(404)
  })

  it('returns 201 with the created chat', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock('u1') as any)
    const fakeChat = { id: 'chat-1', book_id: 'book-1', user_id: 'u1' }
    mockCreateChat.mockResolvedValue(fakeChat as any)

    const res = await POST(makeRequest({ book_id: 'book-1', llm_provider: 'claude', llm_model: 'claude-sonnet-4-6' }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.chat).toEqual(fakeChat)
  })
})

describe('GET /api/ai-assistant/chats', () => {
  it('returns 401 when not authenticated', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock(null) as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns chats for the authenticated user', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock('u1') as any)
    const chats = [{ id: 'chat-1' }, { id: 'chat-2' }]
    mockGetChats.mockResolvedValue(chats as any)

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.chats).toEqual(chats)
  })
})

// __tests__/api/ai-assistant-delete-book.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/features/ai-assistant/chatService', () => ({
  deleteBook: vi.fn(),
}))

import { DELETE } from '@/app/api/ai-assistant/books/[bookId]/route'
import { createClient } from '@/lib/supabase/server'
import { deleteBook } from '@/features/ai-assistant/chatService'

const mockCreateClient = vi.mocked(createClient)
const mockDeleteBook = vi.mocked(deleteBook)

function makeSupabaseMock(userId = 'user-1', bookRow: { id: string; user_id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: bookRow, error: bookRow ? null : { message: 'Not found' } }),
        }),
      }),
    }),
  }
}

function makeUnauthMock() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  }
}

function makeRequest(): NextRequest {
  return new Request('http://localhost/api/ai-assistant/books/book-1') as unknown as NextRequest
}

beforeEach(() => vi.clearAllMocks())

describe('DELETE /api/ai-assistant/books/[bookId]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(makeUnauthMock() as unknown as Awaited<ReturnType<typeof createClient>>)

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ bookId: 'book-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when book does not exist', async () => {
    mockCreateClient.mockResolvedValue(
      makeSupabaseMock('user-1', null) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ bookId: 'book-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 404 when book belongs to a different user', async () => {
    // The route queries with .eq('user_id', user.id) — authed as 'other-user' but book is 'user-1'
    mockCreateClient.mockResolvedValue(
      makeSupabaseMock('other-user', null) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ bookId: 'book-1' }) })
    expect(res.status).toBe(404)
  })

  it('deletes the book and returns 200 on success', async () => {
    mockCreateClient.mockResolvedValue(
      makeSupabaseMock('user-1', { id: 'book-1', user_id: 'user-1' }) as unknown as Awaited<ReturnType<typeof createClient>>
    )
    mockDeleteBook.mockResolvedValue(undefined)

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ bookId: 'book-1' }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(mockDeleteBook).toHaveBeenCalledWith('book-1', 'user-1')
  })
})

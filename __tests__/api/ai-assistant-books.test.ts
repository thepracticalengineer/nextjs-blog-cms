vi.mock('@/lib/auth/session', async () => ({ authorizeSession: (await import('../helpers/session')).routeTestSession }))
// __tests__/api/ai-assistant-books.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/features/ai-assistant/chatService', () => ({
  createBook: vi.fn(),
  getBooks: vi.fn(),
}))

vi.mock('@/features/ai-assistant/pdfService', () => ({
  extractTextFromPdf: vi.fn(),
}))

import { POST, GET } from '@/app/api/ai-assistant/books/route'
import { createClient } from '@/lib/supabase/server'
import { createBook, getBooks } from '@/features/ai-assistant/chatService'
import { extractTextFromPdf } from '@/features/ai-assistant/pdfService'

const mockCreateClient = vi.mocked(createClient)
const mockCreateBook = vi.mocked(createBook)
const mockGetBooks = vi.mocked(getBooks)
const mockExtractTextFromPdf = vi.mocked(extractTextFromPdf)

function makeAuthMock(userId = 'user-1') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
  }
}

type FakeFile = {
  name: string
  type: string
  size: number
  arrayBuffer: () => Promise<ArrayBuffer>
} | null

function makePostRequest(file: FakeFile, title?: string): NextRequest {
  return {
    formData: async () => ({
      get: (key: string) => {
        if (key === 'file') return file
        if (key === 'title') return title ?? null
        return null
      },
    }),
  } as unknown as NextRequest
}

function makeGetRequest(): NextRequest {
  return new Request('http://localhost/api/ai-assistant/books') as unknown as NextRequest
}

function makePdfFile(sizeBytes = 1024): FakeFile {
  const content = new Uint8Array(sizeBytes).fill(37)
  return {
    name: 'book.pdf',
    type: 'application/pdf',
    size: sizeBytes,
    arrayBuffer: async () => content.buffer as ArrayBuffer,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/ai-assistant/books', () => {
  it('returns 401 when user is not authenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>)

    const res = await POST(makePostRequest(makePdfFile()))
    expect(res.status).toBe(401)
  })

  it('returns 400 when no file provided', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock() as unknown as Awaited<ReturnType<typeof createClient>>)

    const res = await POST(makePostRequest(null))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/no file/i)
  })

  it('returns 400 when file is not a PDF', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock() as unknown as Awaited<ReturnType<typeof createClient>>)

    const textFile: FakeFile = {
      name: 'doc.txt',
      type: 'text/plain',
      size: 5,
      arrayBuffer: async () => new TextEncoder().encode('hello').buffer as ArrayBuffer,
    }
    const res = await POST(makePostRequest(textFile))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/pdf/i)
  })

  it('returns 400 when PDF is larger than 30MB', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock() as unknown as Awaited<ReturnType<typeof createClient>>)

    const bigFile: FakeFile = {
      name: 'big.pdf',
      type: 'application/pdf',
      size: 31 * 1024 * 1024,
      arrayBuffer: async () => new ArrayBuffer(0),
    }
    const res = await POST(makePostRequest(bigFile))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/30MB/i)
  })

  it('returns 400 when extracted text is empty (image-only PDF)', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock() as unknown as Awaited<ReturnType<typeof createClient>>)
    mockExtractTextFromPdf.mockResolvedValue({
      text: '   ',
      pageCount: 1,
      title: null,
      wordCount: 0,
      charCount: 0,
      wasTruncated: false,
    })

    const res = await POST(makePostRequest(makePdfFile()))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/text-based/i)
  })

  it('returns 201 with word_count, char_count, page_count on valid upload', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock() as unknown as Awaited<ReturnType<typeof createClient>>)
    const longText = 'This is extracted book content with many words. '.repeat(5).trim()
    mockExtractTextFromPdf.mockResolvedValue({
      text: longText,
      pageCount: 12,
      title: 'My Book',
      wordCount: 40,
      charCount: longText.length,
      wasTruncated: false,
    })
    mockCreateBook.mockResolvedValue({
      id: 'book-1',
      user_id: 'user-1',
      title: 'My Book',
      file_name: 'book.pdf',
      page_count: 12,
      extracted_text: longText,
      word_count: 40,
      char_count: longText.length,
      created_at: '2026-04-14T10:00:00Z',
      updated_at: '2026-04-14T10:00:00Z',
    })

    const res = await POST(makePostRequest(makePdfFile()))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.word_count).toBe(40)
    expect(json.data.char_count).toBe(longText.length)
    expect(json.data.page_count).toBe(12)
    expect(json.data).not.toHaveProperty('file_url')
  })

  it('uses title override from form data when provided', async () => {
    mockCreateClient.mockResolvedValue(makeAuthMock() as unknown as Awaited<ReturnType<typeof createClient>>)
    const longText2 = 'Some book content here with enough characters to pass the minimum threshold. '.repeat(2).trim()
    mockExtractTextFromPdf.mockResolvedValue({
      text: longText2,
      pageCount: 5,
      title: 'PDF Title',
      wordCount: 20,
      charCount: longText2.length,
      wasTruncated: false,
    })
    mockCreateBook.mockResolvedValue({
      id: 'book-2',
      user_id: 'user-1',
      title: 'Custom Title',
      file_name: 'book.pdf',
      page_count: 5,
      extracted_text: longText2,
      word_count: 20,
      char_count: longText2.length,
      created_at: '2026-04-14T10:00:00Z',
      updated_at: '2026-04-14T10:00:00Z',
    })

    const res = await POST(makePostRequest(makePdfFile(), 'Custom Title'))
    expect(res.status).toBe(201)

    const callArgs = mockCreateBook.mock.calls[0][0]
    expect(callArgs.title).toBe('Custom Title')
  })
})

describe('GET /api/ai-assistant/books', () => {
  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>)

    const res = await GET(makeGetRequest())
    expect(res.status).toBe(401)
  })
})

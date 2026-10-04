import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetText, mockGetInfo, mockDestroy, mockPdfParse } = vi.hoisted(() => ({
  mockGetText: vi.fn(),
  mockGetInfo: vi.fn(),
  mockDestroy: vi.fn(),
  mockPdfParse: vi.fn(),
}))

vi.mock('pdf-parse', () => ({
  PDFParse: class {
    constructor(options: unknown) { mockPdfParse(options) }
    getText = mockGetText
    getInfo = mockGetInfo
    destroy = mockDestroy
  },
}))

import { extractTextFromPdf } from '@/features/ai-assistant/pdfService'

describe('extractTextFromPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetInfo.mockResolvedValue({ info: {} })
    mockDestroy.mockResolvedValue(undefined)
  })

  it('returns text, pageCount, wordCount, charCount, wasTruncated=false for normal PDF', async () => {
    mockGetText.mockResolvedValue({
      text: 'Hello world. This is a test document with some content.',
      total: 3,
      metadata: null,
      numrender: 0, version: 'v1.10.100',
    })

    mockGetInfo.mockResolvedValue({ info: { Title: ' My PDF ' } })
    const buf = Buffer.from('fake-pdf-bytes')
    const result = await extractTextFromPdf(buf)

    expect(result.text).toContain('Hello world')
    expect(result.pageCount).toBe(3)
    expect(result.title).toBe('My PDF')
    expect(result.wordCount).toBeGreaterThan(0)
    expect(result.charCount).toBe(result.text.length)
    expect(result.wasTruncated).toBe(false)
    expect(mockPdfParse).toHaveBeenCalledWith({ data: buf })
    expect(mockDestroy).toHaveBeenCalledOnce()
  })

  it('releases the parser when extraction fails', async () => {
    mockGetText.mockRejectedValueOnce(new Error('Invalid PDF'))
    await expect(extractTextFromPdf(Buffer.from('bad'))).rejects.toThrow('Invalid PDF')
    expect(mockDestroy).toHaveBeenCalledOnce()
  })

  it('releases the parser when metadata fails', async () => {
    mockGetText.mockResolvedValueOnce({ text: 'Text', total: 1 })
    mockGetInfo.mockRejectedValueOnce(new Error('Metadata error'))
    await expect(extractTextFromPdf(Buffer.from('bad'))).rejects.toThrow('Metadata error')
    expect(mockDestroy).toHaveBeenCalledOnce()
  })

  it('returns null title when PDF metadata has no Title', async () => {
    mockGetText.mockResolvedValue({
      text: 'Some text.',
      total: 1,
      info: {},
      metadata: null,
      numrender: 0, version: 'v1.10.100',
    })

    const result = await extractTextFromPdf(Buffer.from('fake'))
    expect(result.title).toBeNull()
  })

  it('sets wasTruncated=true and appends note when text exceeds 400,000 chars', async () => {
    const longText = 'a'.repeat(500000)
    mockGetText.mockResolvedValue({
      text: longText,
      total: 100,
      info: {},
      metadata: null,
      numrender: 0, version: 'v1.10.100',
    })

    const result = await extractTextFromPdf(Buffer.from('fake'))
    expect(result.wasTruncated).toBe(true)
    expect(result.text.length).toBeLessThan(500000)
    expect(result.text).toContain('[Note: This document was truncated')
    expect(result.charCount).toBe(result.text.length)
  })

  it('collapses multiple blank lines into at most two newlines', async () => {
    mockGetText.mockResolvedValue({
      text: 'line one\n\n\n\n\n\nline two',
      total: 1,
      info: {},
      metadata: null,
      numrender: 0, version: 'v1.10.100',
    })

    const result = await extractTextFromPdf(Buffer.from('fake'))
    expect(result.text).not.toMatch(/\n{3,}/)
    expect(result.text).toContain('line one')
    expect(result.text).toContain('line two')
  })
})

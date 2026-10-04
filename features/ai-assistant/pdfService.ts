// features/ai-assistant/pdfService.ts
import { PDFParse } from 'pdf-parse'

const MAX_CHARS = 400_000
const TRUNCATION_NOTE =
  '\n\n[Note: This document was truncated due to length. The above content covers the first portion of the book.]'

export type ExtractedPdfData = {
  text: string
  pageCount: number
  title: string | null
  wordCount: number
  charCount: number
  wasTruncated: boolean
}

function cleanText(raw: string): string {
  // Collapse 3+ consecutive newlines into exactly 2
  return raw.replace(/\n{3,}/g, '\n\n').trim()
}

export async function extractTextFromPdf(buffer: Buffer): Promise<ExtractedPdfData> {
  const parser = new PDFParse({ data: buffer })
  try {
    const parsed = await parser.getText({ pageJoiner: '\n\n' })
    const metadata = await parser.getInfo()

    let text = cleanText(parsed.text)
    let wasTruncated = false

    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + TRUNCATION_NOTE
      wasTruncated = true
    }

    const title = (metadata.info?.Title as string | undefined)?.trim() || null
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length
    const charCount = text.length

    return {
      text,
      pageCount: parsed.total,
      title,
      wordCount,
      charCount,
      wasTruncated,
    }
  } finally {
    await parser.destroy()
  }
}

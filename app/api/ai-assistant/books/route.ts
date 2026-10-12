// app/api/ai-assistant/books/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authorizeApi } from '@/lib/auth/api'
import { createBook, getBooks } from '@/features/ai-assistant/chatService'
import { extractTextFromPdf } from '@/features/ai-assistant/pdfService'

/**
 * POST /api/ai-assistant/books
 * Accepts multipart/form-data with a PDF file (max 30MB).
 * Extracts text server-side — the PDF file is NOT stored.
 */
export async function POST(req: NextRequest) {
  const { profile: user, response } = await authorizeApi()
  if (response) return response

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const titleOverride = formData.get('title') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
  }
  if (file.size > 30 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'PDF too large. Maximum size is 30MB.' },
      { status: 400 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  let extracted
  try {
    extracted = await extractTextFromPdf(buffer)
  } catch (err) {
    console.error('[POST /api/ai-assistant/books] PDF extraction error:', err)
    return NextResponse.json(
      { error: 'Failed to parse PDF. Please ensure it is a valid PDF file.' },
      { status: 400 }
    )
  }

  if (!extracted.text.trim() || extracted.text.trim().length < 100) {
    return NextResponse.json(
      {
        error:
          'Could not extract text from this PDF. It may be a scanned image PDF. Please use a text-based PDF.',
      },
      { status: 400 }
    )
  }

  const safeFileName = file.name.replace(/[/\\?%*:|"<>\x00-\x1f]/g, '_')
  const title =
    titleOverride?.trim() ||
    extracted.title ||
    safeFileName.replace(/\.pdf$/i, '')

  const book = await createBook({
    user_id: user.id,
    title,
    file_name: safeFileName,
    page_count: extracted.pageCount,
    extracted_text: extracted.text,
  })

  return NextResponse.json(
    {
      success: true,
      data: {
        id: book.id,
        title: book.title,
        file_name: book.file_name,
        page_count: book.page_count,
        word_count: extracted.wordCount,
        char_count: extracted.charCount,
        was_truncated: extracted.wasTruncated,
        created_at: book.created_at,
      },
    },
    { status: 201 }
  )
}

/**
 * GET /api/ai-assistant/books
 * Returns all books for the current user.
 */
export async function GET(req: NextRequest) {
  const { profile: user, response } = await authorizeApi()
  if (response) return response

  const books = await getBooks(user.id)
  return NextResponse.json({ books })
}

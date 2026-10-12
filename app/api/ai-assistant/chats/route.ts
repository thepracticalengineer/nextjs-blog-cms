import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authorizeApi } from '@/lib/auth/api'
import { createChat, getChats } from '@/features/ai-assistant/chatService'
import { AVAILABLE_MODELS } from '@/features/ai-assistant/types'
import type { LLMProvider } from '@/features/ai-assistant/types'

const ALLOWED_PROVIDERS: Set<string> = new Set(AVAILABLE_MODELS.map((m) => m.provider))

/**
 * POST /api/ai-assistant/chats
 * Body: { book_id: string, llm_provider: string, llm_model: string }
 */
export async function POST(req: NextRequest) {
  const { profile: user, response } = await authorizeApi()
  if (response) return response
  const supabase = await createClient()

  const body = await req.json() as {
    book_id?: string
    llm_provider?: string
    llm_model?: string
  }

  const { book_id, llm_provider, llm_model } = body

  if (!book_id) return NextResponse.json({ error: 'book_id required' }, { status: 400 })
  if (!llm_provider || !ALLOWED_PROVIDERS.has(llm_provider)) {
    return NextResponse.json({ error: 'Invalid llm_provider' }, { status: 400 })
  }
  if (
    !llm_model ||
    !AVAILABLE_MODELS.some((m) => m.id === llm_model && m.provider === llm_provider)
  ) {
    return NextResponse.json({ error: 'Invalid llm_model for llm_provider' }, { status: 400 })
  }

  // Verify the book belongs to this user
  const { data: book } = await supabase
    .from('ai_books')
    .select('id')
    .eq('id', book_id)
    .eq('user_id', user.id)
    .single()

  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 })

  const chat = await createChat({
    book_id,
    user_id: user.id,
    llm_provider: llm_provider as LLMProvider,
    llm_model,
  })

  return NextResponse.json({ chat }, { status: 201 })
}

/**
 * GET /api/ai-assistant/chats
 * Returns recent chats for the current user, ordered by last_message_at desc.
 */
export async function GET() {
  const { profile: user, response } = await authorizeApi()
  if (response) return response

  const chats = await getChats(user.id)
  return NextResponse.json({ chats })
}

// app/api/ai-assistant/chats/[chatId]/messages/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getMessages, addMessage, updateChatLastMessage, updateChatTitle, getChat, getBookById,
} from '@/features/ai-assistant/chatService'
import { sendMessage, generateChatTitle, isRateLimitError } from '@/features/ai-assistant/llmService'
import { getDecryptedApiKey } from '@/features/ai-assistant/llmKeyService'
import type { LLMProvider } from '@/features/ai-assistant/types'

type Params = { params: Promise<{ chatId: string }> }

/**
 * GET /api/ai-assistant/chats/[chatId]/messages
 */
export async function GET(_req: NextRequest, props: Params) {
  const params = await props.params
  const { chatId } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const chat = await getChat(chatId)
  if (!chat || chat.user_id !== user.id) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
  }

  const messages = await getMessages(chatId)
  return NextResponse.json({ messages })
}

/**
 * POST /api/ai-assistant/chats/[chatId]/messages
 * Body: { content: string }
 * Returns a streaming text/plain response (LLM reply chunks).
 */
export async function POST(req: NextRequest, props: Params) {
  const params = await props.params
  const { chatId } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const chat = await getChat(chatId)
  if (!chat || chat.user_id !== user.id) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
  }

  const { content } = await req.json() as { content?: string }
  if (!content?.trim()) {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }

  // Build history for the LLM call without saving the user message yet —
  // we delay the DB write until after the pre-flight so a rate-limit/provider
  // error doesn't leave an orphaned user message in the database.
  const existingHistory = await getMessages(chatId)
  const isFirstMessage = existingHistory.filter((m) => m.role === 'user').length === 0
  const history: typeof existingHistory = [
    ...existingHistory,
    { id: 'pending', chat_id: chatId, role: 'user', content: content.trim(), created_at: new Date().toISOString() },
  ]

  // Get decrypted API key
  let apiKey: string
  try {
    apiKey = await getDecryptedApiKey(chat.llm_provider as LLMProvider)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No API key configured' },
      { status: 422 }
    )
  }

  // Fetch book's extracted text
  if (!chat.book_id) {
    return NextResponse.json({ error: 'Chat has no associated book' }, { status: 400 })
  }

  const book = await getBookById(chat.book_id)
  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 })
  }

  // Stream the LLM response
  const llmStream = sendMessage({
    model: chat.llm_model,
    provider: chat.llm_provider as LLMProvider,
    messages: history,
    extractedText: book.extracted_text,
    apiKey,
  })

  // Pre-flight: get the first chunk before committing to a streaming response.
  // Rate limit errors from providers surface here, before any headers are sent.
  let firstChunk: string | undefined
  try {
    const result = await llmStream.next()
    if (result.done) {
      return NextResponse.json({ error: 'Failed to get a response from the AI provider.' }, { status: 502 })
    }
    firstChunk = result.value
  } catch (err) {
    if (isRateLimitError(err)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a moment and try again.' },
        { status: 429 }
      )
    }
    return NextResponse.json({ error: 'Failed to get a response from the AI provider.' }, { status: 502 })
  }

  // Pre-flight succeeded — now persist the user message
  try {
    await addMessage({ chat_id: chatId, role: 'user', content: content.trim() })
  } catch {
    return NextResponse.json({ error: 'Failed to save message. Please try again.' }, { status: 500 })
  }

  let fullResponse = firstChunk ?? ''

  const readableStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        if (firstChunk !== undefined) {
          controller.enqueue(encoder.encode(firstChunk))
        }
        for await (const chunk of llmStream) {
          fullResponse += chunk
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      } finally {
        // Save assistant message and update metadata (fire and forget)
        Promise.all([
          addMessage({ chat_id: chatId, role: 'assistant', content: fullResponse }),
          updateChatLastMessage(chatId),
          isFirstMessage
            ? generateChatTitle(content.trim(), chat.llm_model, apiKey)
                .then((title) => updateChatTitle(chatId, title))
                .catch(() => null)
            : Promise.resolve(),
        ]).catch(console.error)
      }
    },
  })

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

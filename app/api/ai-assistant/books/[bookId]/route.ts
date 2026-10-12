// app/api/ai-assistant/books/[bookId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authorizeApi, ownsResource } from '@/lib/auth/api'
import { deleteBook } from '@/features/ai-assistant/chatService'

type Params = { params: Promise<{ bookId: string }> }

/**
 * DELETE /api/ai-assistant/books/[bookId]
 * Deletes a book and all its associated chats (via cascade in DB).
 */
export async function DELETE(_req: NextRequest, props: Params) {
  const params = await props.params
  const { bookId } = params
  const { profile: user, response } = await authorizeApi()
  if (response) return response

  const supabase = await createClient()
  // Fetch only the fields needed for ownership check — avoids loading extracted_text
  const { data: book } = await supabase
    .from('ai_books')
    .select('id, user_id')
    .eq('id', bookId)
    .single()

  if (!book || !ownsResource(user, book.user_id)) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 })
  }

  await deleteBook(bookId, user.id)
  return NextResponse.json({ success: true })
}

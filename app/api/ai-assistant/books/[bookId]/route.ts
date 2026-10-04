// app/api/ai-assistant/books/[bookId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteBook } from '@/features/ai-assistant/chatService'

type Params = { params: Promise<{ bookId: string }> }

/**
 * DELETE /api/ai-assistant/books/[bookId]
 * Deletes a book and all its associated chats (via cascade in DB).
 */
export async function DELETE(_req: NextRequest, props: Params) {
  const params = await props.params
  const { bookId } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch only the fields needed for ownership check — avoids loading extracted_text
  const { data: book } = await supabase
    .from('ai_books')
    .select('id, user_id')
    .eq('id', bookId)
    .single()

  if (!book || book.user_id !== user.id) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 })
  }

  await deleteBook(bookId, user.id)
  return NextResponse.json({ success: true })
}

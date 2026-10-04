// app/api/ai-assistant/chats/[chatId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getChat, deleteChat } from '@/features/ai-assistant/chatService'

type Params = { params: Promise<{ chatId: string }> }

/**
 * DELETE /api/ai-assistant/chats/[chatId]
 */
export async function DELETE(_req: NextRequest, props: Params) {
  const params = await props.params
  const { chatId } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const chat = await getChat(chatId)
  if (!chat || chat.user_id !== user.id) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
  }

  await deleteChat(chatId, user.id)
  return NextResponse.json({ success: true })
}

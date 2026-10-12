// app/api/ai-assistant/chats/[chatId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authorizeApi, ownsResource } from '@/lib/auth/api'
import { getChat, deleteChat } from '@/features/ai-assistant/chatService'

type Params = { params: Promise<{ chatId: string }> }

/**
 * DELETE /api/ai-assistant/chats/[chatId]
 */
export async function DELETE(_req: NextRequest, props: Params) {
  const params = await props.params
  const { chatId } = params
  const { profile: user, response } = await authorizeApi()
  if (response) return response

  const chat = await getChat(chatId)
  if (!chat || !ownsResource(user, chat.user_id)) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
  }

  await deleteChat(chatId, user.id)
  return NextResponse.json({ success: true })
}

import type { Post } from '@/features/posts/types'
import { planSlug, writeWithSlug, isSlugConflict, SLUG_CONFLICT } from '@/features/posts/slugs'
import { NextRequest, NextResponse } from 'next/server'
import sanitizeHtml from 'sanitize-html'
import { createClient } from '@/lib/supabase/server'
import { getMessages, getChat, getBookById } from '@/features/ai-assistant/chatService'
import { generateBlogPost } from '@/features/ai-assistant/llmService'
import { getDecryptedApiKey } from '@/features/ai-assistant/llmKeyService'
import { resolveTagIds, resolveCategoryId } from '@/features/api-keys/apiKeyService'
import { createServiceClient } from '@/lib/supabase/service'
import type { LLMProvider } from '@/features/ai-assistant/types'

type Params = { params: Promise<{ chatId: string }> }

/**
 * POST /api/ai-assistant/chats/[chatId]/generate-post
 * Generates a blog post draft from the chat conversation.
 * Returns: { post_id: string, post_slug: string }
 */
export async function POST(_req: NextRequest, props: Params) {
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
  if (messages.length === 0) {
    return NextResponse.json({ error: 'Chat has no messages' }, { status: 400 })
  }

  let apiKey: string
  try {
    apiKey = await getDecryptedApiKey(chat.llm_provider as LLMProvider)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No API key configured' },
      { status: 422 }
    )
  }

  if (!chat.book_id) {
    return NextResponse.json({ error: 'Chat has no associated book' }, { status: 400 })
  }

  const book = await getBookById(chat.book_id)
  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 })
  }

  let postData
  try {
    postData = await generateBlogPost({
      model: chat.llm_model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      extractedText: book.extracted_text,
      apiKey,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const serviceClient = createServiceClient()
  const [tagIds, categoryId] = await Promise.all([
    resolveTagIds(postData.tags ?? [], serviceClient),
    resolveCategoryId(postData.category ?? '', serviceClient),
  ])

  const safeContent = postData.content
    ? sanitizeHtml(postData.content, {
        allowedTags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'blockquote', 'br', 'hr'],
        allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
        transformTags: {
          a: (tagName, attribs) => ({
            tagName,
            attribs: attribs.target === '_blank'
              ? { ...attribs, rel: 'noopener noreferrer' }
              : attribs,
          }),
        },
      })
    : null

  const { data: post, error: postError } = await writeWithSlug<Post>(planSlug('', postData.title), slug => supabase
    .from('posts')
    .insert({
      title: postData.title,
      slug,
      excerpt: postData.excerpt ?? null,
      content: safeContent,
      seo_title: postData.meta_title ?? null,
      seo_description: postData.meta_description ?? null,
      author_id: profile.id,
      status: 'draft',
      category_id: categoryId,
      cover_image: null,
    })
    .select()
    .single())

  if (postError || !post) {
    return NextResponse.json({ error: isSlugConflict(postError) ? SLUG_CONFLICT : 'Failed to create post' }, { status: isSlugConflict(postError) ? 409 : 500 })
  }

  if (tagIds.length > 0) {
    const { error: postTagsError } = await supabase
      .from('post_tags')
      .insert(tagIds.map((tag_id) => ({ post_id: post.id, tag_id })))

    if (postTagsError) {
      await supabase.from('posts').delete().eq('id', post.id)
      return NextResponse.json(
        { error: postTagsError.message ?? 'Failed to create post tags' },
        { status: 500 }
      )
    }
  }

  const { error: aiGeneratedPostError } = await supabase
    .from('ai_generated_posts')
    .insert({ chat_id: chatId, post_id: post.id })

  if (aiGeneratedPostError) {
    await supabase.from('posts').delete().eq('id', post.id)
    return NextResponse.json(
      { error: aiGeneratedPostError.message ?? 'Failed to link generated post to chat' },
      { status: 500 }
    )
  }

  return NextResponse.json({ post_id: post.id, post_slug: post.slug })
}

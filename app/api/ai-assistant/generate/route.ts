import { planSlug, writeWithSlug, isSlugConflict, SLUG_CONFLICT } from '@/features/posts/slugs'
import { type NextRequest } from 'next/server'
import { requireApiKey } from '@/lib/apiAuth'
import { apiSuccess, apiError } from '@/lib/apiHelpers'
import { checkRateLimit } from '@/lib/rateLimit'
import { createServiceClient } from '@/lib/supabase/service'
import { getDecryptedApiKeyForUser } from '@/features/ai-assistant/llmKeyService'
import { generateBlogPostHeadless } from '@/features/ai-assistant/llmService'
import {
  resolveTagIds,
  resolveCategoryId,
  hashApiKey,
} from '@/features/api-keys/apiKeyService'
import { AVAILABLE_MODELS } from '@/features/ai-assistant/types'
import type { LLMProvider } from '@/features/ai-assistant/types'

const PROVIDER_PRIORITY: LLMProvider[] = ['claude', 'openai', 'gemini']

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  claude: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-3.8-flash',
}

type GenerateBody = {
  topic?: unknown
  context?: unknown
  llm_provider?: unknown
  llm_model?: unknown
  tone?: unknown
  word_count?: unknown
  post_overrides?: {
    title?: string
    category?: string
    tags?: string[]
    image_url?: string
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiKey(req)
  if (!auth.success) return apiError(auth.error, auth.status)

  // AI generation rate limit: 10 requests per minute (LLM calls are expensive)
  const rlKey = `ai:${hashApiKey(req.headers.get('Authorization')!.slice(7).trim())}`
  const rl = checkRateLimit(rlKey, 10, 60_000)
  if (!rl.allowed) {
    return Response.json(
      {
        success: false,
        error: 'Rate limit exceeded. Max 10 AI generation requests per minute.',
        retry_after: rl.retryAfter,
      },
      { status: 429 }
    )
  }

  let body: GenerateBody
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON body.', 400)
  }

  if (!body.topic || typeof body.topic !== 'string' || !body.topic.trim()) {
    return apiError('topic is required.', 400)
  }

  const topic = body.topic.trim()
  const context = typeof body.context === 'string' ? body.context : undefined
  const tone = typeof body.tone === 'string' ? body.tone : 'professional'
  const wordCount = typeof body.word_count === 'number' ? body.word_count : 800
  const requestedProvider = typeof body.llm_provider === 'string'
    ? body.llm_provider as LLMProvider
    : null

  // Resolve LLM provider and key
  let resolvedProvider: LLMProvider | null = null
  let resolvedKey: string | null = null
  let resolvedModel: string

  const providersToTry = requestedProvider
    ? [requestedProvider]
    : PROVIDER_PRIORITY

  for (const provider of providersToTry) {
    const key = await getDecryptedApiKeyForUser(provider, auth.userId)
    if (key) {
      resolvedProvider = provider
      resolvedKey = key
      break
    }
  }

  if (!resolvedProvider || !resolvedKey) {
    return Response.json(
      {
        success: false,
        error: 'No LLM provider configured. Add your API keys in Developer Settings.',
        action: 'Visit /dashboard/developer to configure your LLM keys.',
      },
      { status: 422 }
    )
  }

  // Resolve and validate model
  if (typeof body.llm_model === 'string' && body.llm_model.trim()) {
    const requestedModel = body.llm_model.trim()
    const modelInfo = AVAILABLE_MODELS.find((m) => m.id === requestedModel)

    if (!modelInfo) {
      return apiError('Unsupported llm_model.', 422, `Unknown model: ${requestedModel}`)
    }

    if (modelInfo.provider !== resolvedProvider) {
      return apiError(
        'The requested llm_model is not available for the resolved provider.',
        422,
        `Model ${requestedModel} belongs to provider ${modelInfo.provider}, but resolved provider is ${resolvedProvider}.`
      )
    }

    resolvedModel = requestedModel
  } else {
    resolvedModel = DEFAULT_MODELS[resolvedProvider]
  }

  // Call LLM
  let generated
  try {
    generated = await generateBlogPostHeadless({
      topic,
      context,
      tone,
      wordCount,
      model: resolvedModel,
      provider: resolvedProvider,
      apiKey: resolvedKey,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/ai-assistant/generate] LLM error:', message)
    return apiError('LLM provider returned an error.', 502, message)
  }

  // Apply overrides
  const overrides = body.post_overrides ?? {}
  const finalTitle = overrides.title ?? generated.title
  const finalCategory = overrides.category ?? generated.category
  const finalTags: string[] = overrides.tags ?? generated.tags
  const finalImageUrl = overrides.image_url ?? null

  const supabase = createServiceClient()

  // Resolve slug
  const plan = planSlug('', finalTitle)

  // Resolve category
  const categoryId = finalCategory
    ? await resolveCategoryId(finalCategory, supabase)
    : null

  // Insert post as draft
  const { data: post, error: postError } = await writeWithSlug<{ id: string; title: string; slug: string; status: string; created_at: string | null }>(plan, slug => supabase
    .from('posts')
    .insert({
      title: finalTitle,
      slug,
      content: generated.content,
      excerpt: generated.excerpt,
      cover_image: finalImageUrl,
      status: 'draft',
      author_id: auth.userId,
      category_id: categoryId,
      seo_title: generated.meta_title,
      seo_description: generated.meta_description,
      published_at: null,
    })
    .select('id, title, slug, status, created_at')
    .single())

  if (postError || !post) {
    console.error('[POST /api/ai-assistant/generate] Post insert failed:', postError?.message)
    return apiError(isSlugConflict(postError) ? SLUG_CONFLICT : 'Failed to save generated post.', isSlugConflict(postError) ? 409 : 500)
  }

  // Insert post tags
  if (finalTags.length > 0) {
    const tagIds = await resolveTagIds(finalTags, supabase)
    if (tagIds.length > 0) {
      await supabase
        .from('post_tags')
        .insert(tagIds.map((tag_id) => ({ post_id: post.id, tag_id })))
    }
  }

  // Create ai_chats record (book_id is now nullable — see migration 20260413)
  const { data: chat, error: chatError } = await supabase
    .from('ai_chats')
    .insert({
      user_id: auth.userId,
      title: topic,
      llm_provider: resolvedProvider,
      llm_model: resolvedModel,
      last_message_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (chatError || !chat) {
    console.error('[POST /api/ai-assistant/generate] Chat insert failed:', chatError?.message)
    // Non-fatal — post was created; still return success
    return apiSuccess(
      {
        data: {
          post: { id: post.id, title: post.title, slug: post.slug, status: post.status, created_at: post.created_at },
          llm_provider: resolvedProvider,
          llm_model: resolvedModel,
          chat_id: null,
        },
      },
      201
    )
  }

  // Store generation messages for auditability
  const generationPrompt = `Generate a blog post. Topic: ${topic}${context ? '. Context: ' + context : ''}. Tone: ${tone}. Word count: ${wordCount}.`
  const { error: messagesError } = await supabase.from('ai_messages').insert([
    { chat_id: chat.id, role: 'user', content: generationPrompt },
    { chat_id: chat.id, role: 'assistant', content: JSON.stringify(generated) },
  ])
  if (messagesError) {
    console.error('[POST /api/ai-assistant/generate] ai_messages insert failed:', messagesError.message)
  }

  // Link chat to post
  const { error: genPostError } = await supabase
    .from('ai_generated_posts')
    .insert({ chat_id: chat.id, post_id: post.id })
  if (genPostError) {
    console.error('[POST /api/ai-assistant/generate] ai_generated_posts insert failed:', genPostError.message)
  }

  return apiSuccess(
    {
      data: {
        post: { id: post.id, title: post.title, slug: post.slug, status: post.status, created_at: post.created_at },
        llm_provider: resolvedProvider,
        llm_model: resolvedModel,
        chat_id: chat.id,
      },
    },
    201
  )
}

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { postApiSchema, validatePublication, type PostApiBody } from '@/features/posts/publication'
import { refreshPostPaths } from '@/features/posts/cache'
import { scheduleNewsletterSend } from '@/features/newsletter/actions'
import {
  validateApiKey,
  resolveTagIds,
  resolveCategoryId,
  generateUniqueSlugForApi,
} from '@/features/api-keys/apiKeyService'
import { createServiceClient } from '@/lib/supabase/service'

function buildPostPayload(body: PostApiBody, slug: string, categoryId: string | null, userId: string) {
  const postStatus = body.status === 'published' ? 'published' : 'draft'
  const seoDescription = typeof body.meta_description === 'string'
    ? body.meta_description
    : (typeof body.excerpt === 'string' ? body.excerpt : null)

  return {
    title: (body.title ?? '').trim(),
    slug,
    content: body.content ?? '',
    excerpt: typeof body.excerpt === 'string' ? body.excerpt : null,
    cover_image: typeof body.image_url === 'string' ? body.image_url : null,
    status: postStatus,
    author_id: userId,
    category_id: categoryId,
    seo_title: typeof body.meta_title === 'string' ? body.meta_title : (body.title ?? '').trim(),
    seo_description: seoDescription,
    published_at: postStatus === 'published' ? new Date().toISOString() : null,
  }
}

async function insertPostWithTags(
  supabase: ReturnType<typeof createServiceClient>,
  payload: ReturnType<typeof buildPostPayload>,
  tags: string[] | undefined
) {
  const { data: post, error: postError } = await supabase
    .from('posts')
    .insert(payload)
    .select()
    .single()

  if (postError) {
    console.error('[API] Failed to insert post:', postError.message)
    return { post: null, error: 'Failed to create post' }
  }

  if (Array.isArray(tags) && tags.length > 0) {
    const tagNames = tags.filter((t) => typeof t === 'string' && t.trim())
    const tagIds = await resolveTagIds(tagNames, supabase)
    if (tagIds.length > 0) {
      const { error: postTagsError } = await supabase
        .from('post_tags')
        .insert(tagIds.map((tag_id) => ({ post_id: post.id, tag_id })))

      if (postTagsError) {
        await supabase.from('posts').delete().eq('id', post.id)
        console.error('[API] Failed to insert post tags:', postTagsError.message)
        return { post: null, error: 'Failed to create post tags' }
      }
    }
  }

  return { post, error: null }
}

export async function POST(request: Request) {
  // 1. Authenticate via API key
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: 'Missing or invalid Authorization header' },
      { status: 401 }
    )
  }

  const userId = await validateApiKey(authHeader.slice(7))
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Invalid or revoked API key' }, { status: 401 })
  }

  // 2. Parse and validate body
  let rawBody: Record<string, unknown>
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = postApiSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid post fields', details: { field_errors: parsed.error.flatten().fieldErrors } }, { status: 422 })
  }
  const body = parsed.data
  const supabase = createServiceClient()
  const resolvedSlug = body.slug?.trim() || (body.title?.trim()
    ? await generateUniqueSlugForApi(body.title, supabase)
    : `draft-${randomUUID()}`)
  const payload = buildPostPayload(body, resolvedSlug, null, userId)
  if (payload.status === 'published') {
    const fieldErrors = await validatePublication(supabase, payload, body.editorial_reviewed)
    if (Object.keys(fieldErrors).length) {
      return NextResponse.json({ success: false, error: 'Publication blocked', details: { field_errors: fieldErrors } }, { status: 422 })
    }
  }
  payload.category_id = body.category ? await resolveCategoryId(body.category, supabase) : null

  // 4. Insert post with tags
  const { post, error } = await insertPostWithTags(supabase, payload, body.tags)

  if (error) {
    return NextResponse.json({ success: false, error }, { status: 500 })
  }

  if (post?.status === 'published') {
    try { await scheduleNewsletterSend(post.id) } catch (err) { console.error('[API] Newsletter scheduling failed:', err) }
  }
  refreshPostPaths(post?.slug)
  return NextResponse.json({ success: true, data: { post } }, { status: 201 })
}

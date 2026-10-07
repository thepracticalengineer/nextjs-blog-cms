import type { Post } from '@/features/posts/types'
import { NextResponse } from 'next/server'
import { postApiSchema, validatePublication, type PostApiBody } from '@/features/posts/publication'
import { refreshPostPaths, refreshDraftPaths } from '@/features/posts/cache'
import { scheduleNewsletterSend } from '@/features/newsletter/actions'
import {
  validateApiKey,
  resolveTagIds,
  resolveCategoryId,
} from '@/features/api-keys/apiKeyService'
import { planSlug, writeWithSlug, isSlugConflict, SLUG_CONFLICT } from '@/features/posts/slugs'
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
  tags: string[] | undefined,
  plan: ReturnType<typeof planSlug>
) {
  const { data: post, error: postError } = await writeWithSlug<Post>(plan, slug => supabase
    .from('posts')
    .insert({ ...payload, slug })
    .select()
    .single())

  if (postError) {
    console.error('[API] Failed to insert post:', postError.message)
    return { post: null, error: isSlugConflict(postError) ? SLUG_CONFLICT : 'Failed to create post' }
  }

  if (!post) return { post: null, error: 'Failed to create post' }

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
  const plan = planSlug(body.slug, body.title ?? '')
  if (plan.error) return NextResponse.json({ success: false, error: plan.error, details: { field_errors: { slug: [plan.error] } } }, { status: 422 })
  const payload = buildPostPayload(body, plan.slug, null, userId)
  if (payload.status === 'published') {
    const fieldErrors = await validatePublication(supabase, payload, body.editorial_reviewed, undefined, plan.automatic)
    if (Object.keys(fieldErrors).length) {
      return NextResponse.json({ success: false, error: 'Publication blocked', details: { field_errors: fieldErrors } }, { status: 422 })
    }
  }
  payload.category_id = body.category ? await resolveCategoryId(body.category, supabase) : null

  // 4. Insert post with tags
  const { post, error } = await insertPostWithTags(supabase, payload, body.tags, plan)

  if (error) {
    return NextResponse.json({ success: false, error, ...(error === SLUG_CONFLICT ? { details: { field_errors: { slug: [error] } } } : {}) }, { status: error === SLUG_CONFLICT ? 409 : 500 })
  }

  if (post?.status === 'published') {
    try { await scheduleNewsletterSend(post.id) } catch (err) { console.error('[API] Newsletter scheduling failed:', err) }
  }
  if (post?.status === 'published') refreshPostPaths(post.slug)
  else refreshDraftPaths()
  return NextResponse.json({ success: true, data: { post } }, { status: 201 })
}

import { type NextRequest } from 'next/server'
import { postApiSchema, validatePublication } from '@/features/posts/publication'
import { refreshPostPaths } from '@/features/posts/cache'
import { scheduleNewsletterSend, cancelNewsletterSend } from '@/features/newsletter/actions'
import { requireApiKey } from '@/lib/apiAuth'
import { apiSuccess, apiError } from '@/lib/apiHelpers'
import { checkRateLimit } from '@/lib/rateLimit'
import { createServiceClient } from '@/lib/supabase/service'
import {
  resolveTagIds,
  resolveCategoryId,
  hashApiKey,
} from '@/features/api-keys/apiKeyService'

const POST_FULL_SELECT = `
  id, title, slug, content, excerpt, seo_title, seo_description,
  status, cover_image, author_id, created_at, updated_at, published_at,
  category:categories(name),
  tags:post_tags(tag:tags(name))
`

type RawPostFull = {
  id: string
  title: string
  slug: string
  content: string | null
  excerpt: string | null
  seo_title: string | null
  seo_description: string | null
  status: string
  cover_image: string | null
  author_id: string | null
  created_at: string | null
  updated_at: string | null
  published_at: string | null
  category: { name: string } | null
  tags: { tag: { name: string } | null }[]
}

function normalizeFullPost(raw: RawPostFull) {
  return {
    id: raw.id,
    title: raw.title,
    slug: raw.slug,
    content: raw.content,
    excerpt: raw.excerpt,
    meta_title: raw.seo_title,
    meta_description: raw.seo_description,
    status: raw.status,
    category: raw.category?.name ?? null,
    tags: (raw.tags ?? []).map((pt) => pt.tag?.name).filter(Boolean) as string[],
    image_url: raw.cover_image,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    published_at: raw.published_at,
  }
}

function getRateLimitKey(req: NextRequest): string {
  return hashApiKey(req.headers.get('Authorization')!.slice(7).trim())
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKey(req)
  if (!auth.success) return apiError(auth.error, auth.status)

  const rl = checkRateLimit(getRateLimitKey(req), 60, 60_000)
  if (!rl.allowed) return apiError('Rate limit exceeded.', 429, { retry_after: rl.retryAfter })

  const { id } = await context.params
  const supabase = createServiceClient()

  // Detect UUID vs slug to avoid PostgREST injection via .or() with unvalidated input
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const isUuid = UUID_PATTERN.test(id)

  const { data, error } = await supabase
    .from('posts')
    .select(POST_FULL_SELECT)
    .eq(isUuid ? 'id' : 'slug', id)
    .eq('author_id', auth.userId)
    .single()

  if (error || !data) return apiError('Post not found.', 404)

  return apiSuccess({ data: normalizeFullPost(data as unknown as RawPostFull) })
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKey(req)
  if (!auth.success) return apiError(auth.error, auth.status)

  const rl = checkRateLimit(getRateLimitKey(req), 60, 60_000)
  if (!rl.allowed) return apiError('Rate limit exceeded.', 429, { retry_after: rl.retryAfter })

  const { id } = await context.params
  const supabase = createServiceClient()

  // Verify post exists and is owned by this user
  const { data: existing, error: fetchError } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .eq('author_id', auth.userId)
    .single()

  if (fetchError || !existing) return apiError('Post not found.', 404)

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return apiError('Invalid JSON body.', 400)
  }

  const parsed = postApiSchema.safeParse(rawBody)
  if (!parsed.success) return apiError('Invalid post fields', 422, { field_errors: parsed.error.flatten().fieldErrors })
  const body = parsed.data
  if (body.slug !== undefined) body.slug = body.slug.trim()
  const candidate = {
    ...existing,
    ...(body.title !== undefined ? { title: body.title.trim() } : {}),
    ...(body.content !== undefined ? { content: body.content } : {}),
    ...(body.slug !== undefined ? { slug: body.slug } : {}),
    ...(body.excerpt !== undefined ? { excerpt: body.excerpt } : {}),
    ...(body.meta_title !== undefined ? { seo_title: body.meta_title } : {}),
    ...(body.meta_description !== undefined ? { seo_description: body.meta_description } : {}),
    ...(body.image_url !== undefined ? { cover_image: body.image_url } : {}),
    status: body.status ?? existing.status,
  }
  // Validate the entire resulting document, including PATCHes without status.
  if (candidate.status === 'published') {
    const fieldErrors = await validatePublication(supabase, candidate, body.editorial_reviewed, id)
    if (Object.keys(fieldErrors).length) return apiError('Publication blocked', 422, { field_errors: fieldErrors })
  } else if (body.slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) {
    return apiError('Invalid slug', 422, { field_errors: { slug: ['Use lowercase letters, numbers and hyphens.'] } })
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (body.title !== undefined) updatePayload.title = body.title.trim()
  if (body.content !== undefined) updatePayload.content = body.content
  if (body.slug !== undefined) updatePayload.slug = body.slug
  if (body.excerpt !== undefined) updatePayload.excerpt = body.excerpt
  if (body.meta_title !== undefined) updatePayload.seo_title = body.meta_title
  if (body.meta_description !== undefined) updatePayload.seo_description = body.meta_description
  if (body.image_url !== undefined) updatePayload.cover_image = body.image_url

  // Handle status transitions
  if (body.status !== undefined) {
    updatePayload.status = body.status
    const currentPost = existing as { status: string; published_at: string | null }
    if (body.status === 'published' && !currentPost.published_at) {
      updatePayload.published_at = new Date().toISOString()
    } else if (body.status === 'draft') {
      updatePayload.published_at = null
    }
  }

  // Handle category
  if (body.category !== undefined) {
    updatePayload.category_id = body.category
      ? await resolveCategoryId(body.category, supabase)
      : null
  }

  const { data: updated, error: updateError } = await supabase
    .from('posts')
    .update(updatePayload)
    .eq('id', id)
    .eq('author_id', auth.userId)
    .eq('updated_at', existing.updated_at)
    .eq('status', existing.status)
    .select(POST_FULL_SELECT)
    .single()

  if (updateError || !updated) {
    console.error('[PATCH /api/posts/[id]] Update failed:', updateError?.message)
    return apiError('The post changed or could not be saved. Reload before trying again.', 409)
  }

  // Handle tags update if provided
  if (Array.isArray(body.tags)) {
    await supabase.from('post_tags').delete().eq('post_id', id)
    if (body.tags.length > 0) {
      const tagNames = body.tags.filter((t) => typeof t === 'string' && t.trim())
      const tagIds = await resolveTagIds(tagNames, supabase)
      if (tagIds.length > 0) {
        const { error: tagsError } = await supabase
          .from('post_tags')
          .insert(tagIds.map((tag_id) => ({ post_id: id, tag_id })))
        if (tagsError) {
          console.error('[PATCH /api/posts/[id]] Tag update failed:', tagsError.message)
        }
      }
    }
  }

  if (candidate.status === 'draft' && existing.status === 'published') {
    await cancelNewsletterSend(id)
  } else if (candidate.status === 'published' && existing.status !== 'published') {
    try { await scheduleNewsletterSend(id) } catch (err) { console.error('[API] Newsletter scheduling failed:', err) }
  }
  refreshPostPaths(existing.slug, updated.slug)
  return apiSuccess({ data: normalizeFullPost(updated as unknown as RawPostFull) })
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKey(req)
  if (!auth.success) return apiError(auth.error, auth.status)

  const rl = checkRateLimit(getRateLimitKey(req), 60, 60_000)
  if (!rl.allowed) return apiError('Rate limit exceeded.', 429, { retry_after: rl.retryAfter })

  const { id } = await context.params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('posts')
    .delete()
    .eq('id', id)
    .eq('author_id', auth.userId)
    .select('id, slug')
    .single()

  if (error || !data) return apiError('Post not found.', 404)

  refreshPostPaths(data.slug)
  return apiSuccess({ message: 'Post deleted successfully.' })
}

import { type NextRequest } from 'next/server'
import { requireApiKey } from '@/lib/apiAuth'
import { parsePaginationParams, parsePostFilters, apiSuccess, apiError } from '@/lib/apiHelpers'
import { checkRateLimit } from '@/lib/rateLimit'
import { createServiceClient } from '@/lib/supabase/service'
import { hashApiKey } from '@/features/api-keys/apiKeyService'

const POST_LIST_SELECT = `
  id, title, slug, excerpt, status, cover_image, cover_image_alt, created_at, updated_at, published_at,
  category:categories(name),
  tags:post_tags(tag:tags(name))
`

type RawPostRow = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  status: string
  cover_image_alt: string
  cover_image: string | null
  created_at: string | null
  updated_at: string | null
  published_at: string | null
  category: { name: string } | null
  tags: { tag: { name: string } | null }[]
  [key: string]: unknown
}

function normalizeListPost(raw: RawPostRow) {
  return {
    id: raw.id,
    title: raw.title,
    slug: raw.slug,
    excerpt: raw.excerpt,
    status: raw.status,
    category: raw.category?.name ?? null,
    tags: (raw.tags ?? []).map((pt) => pt.tag?.name).filter(Boolean) as string[],
    image_url: raw.cover_image,
    image_alt: raw.cover_image_alt,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    published_at: raw.published_at,
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req)
  if (!auth.success) return apiError(auth.error, auth.status)

  const rawKey = req.headers.get('Authorization')!.slice(7).trim()
  const rl = checkRateLimit(hashApiKey(rawKey), 60, 60_000)
  if (!rl.allowed) {
    return apiError('Rate limit exceeded. Max 60 requests per minute.', 429, {
      retry_after: rl.retryAfter,
    })
  }

  const { searchParams } = new URL(req.url)
  const { page, limit, offset } = parsePaginationParams(searchParams)
  const filters = parsePostFilters(searchParams)

  const supabase = createServiceClient()
  let query = supabase
    .from('posts')
    .select(POST_LIST_SELECT, { count: 'exact' })
    .eq('author_id', auth.userId)

  if (filters.status) {
    query = query.eq('status', filters.status) as typeof query
  }

  if (filters.search) {
    query = query.ilike('title', `%${filters.search}%`) as typeof query
  }

  const validSorts = ['created_at', 'updated_at', 'title']
  const sort = validSorts.includes(filters.sort) ? filters.sort : 'created_at'
  const ascending = filters.order === 'asc'

  const { data, error, count } = await query
    .order(sort, { ascending })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[GET /api/posts] DB error:', error.message)
    return apiError('Failed to fetch posts.', 500)
  }

  const posts = (data ?? []).map((p) => normalizeListPost(p as unknown as RawPostRow))
  const total = count ?? 0
  const totalPages = Math.ceil(total / limit)

  return apiSuccess({
    data: posts,
    pagination: {
      page,
      limit,
      total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
    },
  })
}

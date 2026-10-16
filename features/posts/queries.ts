import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'
import { parsePage, type DashboardListState } from './list-state'
import type { PostWithRelations, PublicPostSummary, DashboardPostPage } from './types'

export const POST_SELECT = `
  *,
  author:public_author_profiles!posts_author_id_fkey(id, full_name, avatar_url),
  category:categories(id, name, slug),
  tags:post_tags(tag:tags(id, name, slug))
`

export const PUBLIC_POST_SELECT = `
  id, title, slug, excerpt, cover_image, cover_image_alt, published_at, reading_time_minutes,
  author:public_author_profiles!posts_author_id_fkey(id, full_name, avatar_url),
  category:categories(id, name, slug),
  tags:post_tags(tag:tags(id, name, slug))
`

export function normalizeSummary(raw: unknown): PublicPostSummary {
  const post = raw as Omit<PublicPostSummary, 'tags'> & { tags: { tag: PublicPostSummary['tags'][number] | null }[] }
  return { ...post, tags: (post.tags ?? []).map(pt => pt.tag).filter((tag): tag is PublicPostSummary['tags'][number] => !!tag) }
}

export function normalizePost(raw: PostWithRelations): PostWithRelations {
  return {
    ...raw,
    // @ts-expect-error nested join shape
    tags: (raw.tags ?? []).map((pt: { tag: unknown }) => pt.tag).filter(Boolean),
  }
}

export async function getPublishedPosts(page = 1, limit = 10, filter?: { categoryId?: string; tagId?: string; authorId?: string }): Promise<{ posts: PublicPostSummary[]; total: number }> {
  const supabase = await createClient()
  const safePage = parsePage(String(page))
  const safeLimit = Number.isSafeInteger(limit) && limit > 0 && limit <= 100 ? limit : 10
  const from = (safePage - 1) * safeLimit
  // A separate inner join filters posts while preserving the full tag list.
  const selection = filter?.tagId ? `${PUBLIC_POST_SELECT}, matching_tags:post_tags!inner(tag_id)` : PUBLIC_POST_SELECT
  let query = supabase.from('posts').select(selection, { count: 'exact' }).eq('status', 'published')
  if (filter?.categoryId) query = query.eq('category_id', filter.categoryId)
  if (filter?.tagId) query = query.eq('matching_tags.tag_id', filter.tagId)
  if (filter?.authorId) query = query.eq('author_id', filter.authorId)
  const { data, error, count } = await query
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false }).range(from, from + safeLimit - 1)
  if (error?.code === 'PGRST103' && safePage > 1) {
    // PostgREST omits the parsed count on 416. A valid first-page query recovers
    // the same filtered total without treating a range miss as a database outage.
    const firstPage = await getPublishedPosts(1, safeLimit, filter)
    return { posts: [], total: firstPage.total }
  }
  if (error) throw error
  return { posts: (data ?? []).map(normalizeSummary), total: count ?? 0 }
}

export const getPostBySlug = cache(async (slug: string) => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (error) return null
  return normalizePost(data as PostWithRelations)
})

export async function getDashboardPosts(state: DashboardListState): Promise<DashboardPostPage> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_dashboard_posts', {
    p_page: state.page, p_page_size: state.pageSize, p_search: state.search,
    p_category_id: state.category, p_sort: state.sort, p_direction: state.direction,
  })
  if (error) throw error
  return data as DashboardPostPage
}

export async function getPostById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', id)
    .single()

  if (error) return null
  return normalizePost(data as PostWithRelations)
}

export type TagWithCount = { id: string; name: string; slug: string; count: number }

export async function getPopularTags(limit = 8): Promise<TagWithCount[]> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_popular_tags', { tag_limit: limit })

  if (error) throw error

  return ((data ?? []) as TagWithCount[]).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    count: Number(row.count),
  }))
}

// Resolve every former URL directly to the current slug, avoiding redirect
// chains and loops. RLS and the status check keep unpublished posts private.
export async function getPostRedirect(slug: string): Promise<string | null> {
  const supabase = await createClient()
  const { data: route, error } = await supabase.from('post_slug_routes')
    .select('post_id').eq('slug', slug).eq('was_published', true).maybeSingle()
  if (error || !route) return null
  const { data: post } = await supabase.from('posts').select('slug')
    .eq('id', route.post_id).eq('status', 'published').maybeSingle()
  return post && post.slug !== slug ? post.slug : null
}

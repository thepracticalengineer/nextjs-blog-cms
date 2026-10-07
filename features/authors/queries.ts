import { createClient } from '@/lib/supabase/server'
import { normalizePost, POST_SELECT } from '@/features/posts/queries'
import type { PostWithRelations } from '@/features/posts/types'
import type { PublicAuthor } from './types'

const AUTHOR_SELECT = 'id, full_name, avatar_url, bio, website, twitter_url, linkedin_url, github_url, instagram_url, facebook_url, youtube_url, tiktok_url'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseAuthorPage(value: string | string[] | undefined): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page <= 1_000_000 ? page : 1
}

export async function getPublicAuthor(id: string): Promise<PublicAuthor | null> {
  if (!UUID.test(id)) return null
  const supabase = await createClient()
  const { data, error } = await supabase.from('public_author_profiles')
    .select(AUTHOR_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data as PublicAuthor | null
}

export async function getAuthorPublishedPosts(id: string, page = 1, limit = 12) {
  if (!UUID.test(id)) return { posts: [], total: 0 }
  const safePage = parseAuthorPage(String(page))
  const safeLimit = Number.isSafeInteger(limit) && limit > 0 && limit <= 100 ? limit : 12
  const from = (safePage - 1) * safeLimit
  const supabase = await createClient()
  const { data, error, count } = await supabase.from('posts')
    .select(POST_SELECT, { count: 'exact' })
    .eq('author_id', id)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .range(from, from + safeLimit - 1)
  if (error) throw error
  return { posts: (data ?? []).map(normalizePost) as PostWithRelations[], total: count ?? 0 }
}

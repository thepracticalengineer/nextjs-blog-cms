import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'
import { isPageSlug } from '@/features/pages/urls'
import { siteUrl } from '@/lib/metadata'

interface SitemapPost {
  id: string
  slug: string
  updated_at: string
  category: { id: string; slug: string } | null
  tags: { tag: { id: string; slug: string; merged_into: string | null } | null }[]
  author: { id: string } | null
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteUrl()
  const supabase = await createClient()
  const entries = new Map<string, MetadataRoute.Sitemap[number]>([
    [origin, { url: origin, changeFrequency: 'monthly', priority: 1 }],
    [`${origin}/blog`, { url: `${origin}/blog`, changeFrequency: 'daily', priority: 0.9 }],
  ])
  const add = (path: string, updatedAt?: string, priority = 0.5) => {
    const url = `${origin}${path}`
    const previous = entries.get(url)
    const lastModified = updatedAt ? new Date(updatedAt) : undefined
    if (!previous || (lastModified && (!previous.lastModified || lastModified > new Date(previous.lastModified)))) {
      entries.set(url, { url, ...(lastModified ? { lastModified } : {}), changeFrequency: 'weekly', priority })
    }
  }

  const addPost = (post: SitemapPost) => {
    add(`/blog/${encodeURIComponent(post.slug)}`, post.updated_at, 0.8)
    if (post.category) add(`/blog/category/${encodeURIComponent(post.category.slug)}`, post.updated_at)
    for (const { tag } of post.tags ?? []) {
      if (tag && !tag.merged_into) add(`/blog/tag/${encodeURIComponent(tag.slug)}`, post.updated_at)
    }
    if (post.author) add(`/authors/${post.author.id}`)
  }

  // Page below PostgREST's row cap with a unique stable order. Only published
  // posts can contribute URLs; relationships use the existing public projection.
  const batchSize = 500
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await supabase.from('posts').select(`
      id, slug, updated_at,
      category:categories(id, slug),
      tags:post_tags(tag:tags(id, slug, merged_into)),
      author:public_author_profiles!posts_author_id_fkey(id)
    `).eq('status', 'published').order('id').range(offset, offset + batchSize - 1).returns<SitemapPost[]>()
    // A database outage must not become a successful but incomplete sitemap.
    if (error) throw error
    for (const post of data ?? []) addPost(post)
    if (!data || data.length < batchSize) break
  }
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await supabase.from('page_snapshots')
      .select('page_id, slug, published_at').order('page_id').range(offset, offset + batchSize - 1)
    if (error) throw error
    for (const page of data ?? []) {
      if (isPageSlug(page.slug)) add(`/${page.slug}`, page.published_at, 0.7)
    }
    if (!data || data.length < batchSize) break
  }
  return [...entries.values()]
}

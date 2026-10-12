import type { Post, Profile, Category, Tag } from '@/lib/supabase/types'

export type PostWithRelations = Post & {
  author: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  category: Pick<Category, 'id' | 'name' | 'slug'> | null
  tags: Tag[]
}

export type PostFormValues = {
  auto_slug?: boolean
  confirm_slug_change?: boolean
  editorial_reviewed?: boolean
  title: string
  slug: string
  excerpt: string
  content: string
  cover_image_alt?: string
  cover_image: string
  category_id: string
  seo_title: string
  seo_description: string
  tag_ids: string[]
}

export type { Post, Category, Tag }

// List contracts deliberately exclude content and editor-only fields.
export type PublicPostSummary = Pick<Post, 'id' | 'title' | 'slug' | 'excerpt' | 'cover_image' | 'cover_image_alt' | 'published_at'> & {
  reading_time_minutes: number
  author: PostWithRelations['author']
  category: PostWithRelations['category']
  tags: Pick<Tag, 'id' | 'name' | 'slug'>[]
}
export type DashboardPostSummary = Pick<Post, 'id' | 'title' | 'slug' | 'excerpt' | 'status' | 'updated_at'> & {
  author: Pick<Profile, 'id' | 'full_name'> | null
  category: PostWithRelations['category']
  tags: Pick<Tag, 'id' | 'name'>[]
}
export type DashboardPostPage = {
  posts: DashboardPostSummary[]
  total: number
  page: number
  categories: { id: string; name: string }[]
}

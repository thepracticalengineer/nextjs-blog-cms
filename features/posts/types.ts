import type { Post, Profile, Category, Tag } from '@/lib/supabase/types'

export type PostWithRelations = Post & {
  author: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  category: Pick<Category, 'id' | 'name' | 'slug'> | null
  tags: Tag[]
}

export type PostFormValues = {
  title: string
  slug: string
  excerpt: string
  content: string
  cover_image: string
  category_id: string
  seo_title: string
  seo_description: string
  tag_ids: string[]
}

export type { Post, Category, Tag }

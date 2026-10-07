// features/comments/queries.ts
import { createClient } from '@/lib/supabase/server'
import type { CommentWithAuthor, CommentWithAuthorAndPost } from './types'

const COMMENT_SELECT = `
  *,
  author:public_author_profiles!comments_author_id_fkey(id, full_name, avatar_url)
`

const COMMENT_WITH_POST_SELECT = `
  *,
  author:public_author_profiles!comments_author_id_fkey(id, full_name, avatar_url),
  post:posts!comments_post_id_fkey(id, title, slug)
`

export async function getCommentsByPost(postId: string): Promise<CommentWithAuthor[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('post_id', postId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as CommentWithAuthor[]
}

export async function getAllCommentsForDashboard(): Promise<CommentWithAuthorAndPost[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_WITH_POST_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as CommentWithAuthorAndPost[]
}

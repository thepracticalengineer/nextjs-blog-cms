// features/comments/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { can } from '@/lib/permissions'
import type { Role } from '@/lib/permissions'
import { z } from 'zod'
import { commentContentSchema } from './validation'
import { authorizeSession, getProfile } from '@/lib/auth/session'

const saveError = 'Could not post your comment. Your draft is kept; try again.'

export async function createComment(postId: unknown, content: unknown, postSlug: string, requestId: unknown) {
  const parsed = commentContentSchema.safeParse(content)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  if (!z.uuid().safeParse(postId).success || !z.uuid().safeParse(requestId).success) {
    return { error: 'Invalid comment request. Reload the page and try again.' }
  }
  try {
    const { failure } = await authorizeSession()
    if (failure) return { error: failure.error }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('create_comment', {
      p_post_id: postId, p_content: parsed.data, p_request_id: requestId,
    })
    if (error) {
      if (error.message === 'COMMENT_RATE_LIMIT') {
        const seconds = Number(error.details)
        const retryAfterSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.min(3600, Math.ceil(seconds)) : 60
        return { error: `Too many comments. Try again in ${retryAfterSeconds} seconds. Your draft is kept.`, retryAfterSeconds }
      }
      if (error.message === 'COMMENT_UNAVAILABLE') return { error: 'This article is no longer available for comments. Your draft is kept.' }
      if (error.message === 'COMMENT_REQUEST_CONFLICT') return { error: 'This submission was already used for different text. Reload before submitting a new comment.' }
      if (error.message === 'COMMENT_AUTH_REQUIRED') return { error: 'Sign in and complete two-factor authentication, then retry.' }
      return { error: saveError }
    }
    if (!z.object({ id: z.uuid() }).safeParse(data).success) return { error: saveError }
    revalidatePath(`/blog/${postSlug}`)
    return { data }
  } catch {
    return { error: saveError }
  }
}

export async function deleteComment(id: string, postSlug: string) {
  const profile = await getProfile()
  if (!profile) return { error: 'Unauthorized' }

  const canDeleteOwn = can(profile.role as Role, 'comments:delete:own')
  const canDeleteAll = can(profile.role as Role, 'comments:delete:all')

  if (!canDeleteOwn && !canDeleteAll) return { error: 'Unauthorized' }

  const supabase = await createClient()

  // For non-admins, scope deletion to own comments only
  // { count: 'exact' } is required — Supabase returns null for count without it
  let query = supabase.from('comments').delete({ count: 'exact' }).eq('id', id)
  if (!canDeleteAll) {
    query = query.eq('author_id', profile.id)
  }

  const { error, count } = await query

  if (error) return { error: error.message }
  if (!count || count === 0) return { error: 'Unauthorized or comment not found' }

  revalidatePath(`/blog/${postSlug}`)
  revalidatePath('/dashboard/comments')
  return {}
}

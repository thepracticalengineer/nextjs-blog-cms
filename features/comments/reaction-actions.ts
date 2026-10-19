'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { authorizeSession } from '@/lib/auth/session'
import { reactionSchema, snapshotSchema, type ReactionReadResult, type ReactionResult } from './reactions'

const idSchema = z.uuid()
const saveError = 'Could not save your reaction. Refresh and try again.'
const refreshError = 'Could not refresh reactions. Try again.'

export async function readCommentReactions(postId: unknown): Promise<ReactionReadResult> {
  if (!idSchema.safeParse(postId).success) return { error: refreshError }
  try {
    const client = await createClient()
    const [{ data, error }, identity] = await Promise.all([
      client.rpc('get_comment_reactions', { p_post_id: postId }),
      client.auth.getUser(),
    ])
    if (error || identity.error && identity.error.name !== 'AuthSessionMissingError') return { error: refreshError }
    const rows = z.array(snapshotSchema.extend({ comment_id: idSchema })).safeParse(data)
    if (!rows.success) return { error: refreshError }
    return {
      data: Object.fromEntries(rows.data.map(({ comment_id, ...snapshot }) => [comment_id, snapshot])),
      viewerId: identity.data.user?.id ?? null,
    }
  } catch {
    return { error: refreshError }
  }
}

export async function setCommentReaction(commentId: unknown, reaction: unknown): Promise<ReactionResult> {
  const id = idSchema.safeParse(commentId)
  const desired = reactionSchema.safeParse(reaction)
  if (!id.success || !desired.success) return { error: 'Invalid reaction request.' }
  try {
    // No publishing/dashboard permission is required or granted by reacting.
    const { failure } = await authorizeSession()
    if (failure) return { error: failure.error }
    const client = await createClient()
    const { data, error } = await client.rpc('set_comment_reaction', { p_comment_id: id.data, p_reaction: desired.data })
    if (error) {
      if (error.message === 'REACTION_RATE_LIMIT') return { error: 'Too many reaction changes. Wait a minute, then retry.' }
      if (error.message === 'REACTION_UNAVAILABLE') return { error: 'This comment is no longer available for reactions.' }
      if (error.message === 'REACTION_AUTH_REQUIRED') return { error: 'Sign in and complete two-factor authentication, then retry.' }
      return { error: saveError }
    }
    const snapshot = snapshotSchema.safeParse(data)
    return snapshot.success ? { data: snapshot.data } : { error: saveError }
  } catch {
    return { error: saveError }
  }
}

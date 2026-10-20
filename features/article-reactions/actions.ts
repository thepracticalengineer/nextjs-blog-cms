'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { authorizeSession } from '@/lib/auth/session'
import { reactionSchema, snapshotSchema, type ArticleReactionReadResult, type ArticleReactionResult } from './reactions'

export async function readArticleReactions(postId: unknown): Promise<ArticleReactionReadResult> {
  const id = z.uuid().safeParse(postId)
  const failure = { error: 'Could not refresh reactions. Try again.' } as const
  if (!id.success) return failure
  try {
    const client = await createClient()
    const [response, identity] = await Promise.all([
      client.rpc('get_article_reactions', { p_post_id: id.data }), client.auth.getUser(),
    ])
    if (response.error || identity.error && identity.error.name !== 'AuthSessionMissingError') return failure
    const snapshot = snapshotSchema.nullable().safeParse(response.data)
    if (!snapshot.success) return failure
    return { data: snapshot.data, viewerId: identity.data.user?.id ?? null }
  } catch { return failure }
}

export async function setArticleReaction(postId: unknown, reaction: unknown, selected: unknown): Promise<ArticleReactionResult> {
  const input = z.object({ postId: z.uuid(), reaction: reactionSchema, selected: z.boolean() }).safeParse({ postId, reaction, selected })
  if (!input.success) return { error: 'Invalid reaction request.', retryable: false }
  try {
    // Participation grants no publishing/dashboard permissions.
    const { failure } = await authorizeSession()
    if (failure) return { error: failure.error, retryable: failure.code === 'AUTH_UNAVAILABLE' }
    const client = await createClient()
    const { data, error } = await client.rpc('set_article_reaction', {
      p_post_id: input.data.postId, p_reaction: input.data.reaction, p_selected: input.data.selected,
    })
    if (error) {
      if (error.message === 'REACTION_RATE_LIMIT') return { error: 'Too many reaction changes. Wait a minute, then retry.' }
      if (error.message === 'REACTION_UNAVAILABLE') return { error: 'This article is no longer available for reactions.', retryable: false }
      if (error.message === 'REACTION_AUTH_REQUIRED') return { error: 'Sign in and complete two-factor authentication, then retry.', retryable: false }
      if (error.message === 'REACTION_INVALID') return { error: 'Invalid reaction request.', retryable: false }
    } else {
      const snapshot = snapshotSchema.safeParse(data)
      if (snapshot.success) return { data: snapshot.data }
    }
  } catch { /* A lost response can still have committed. Reconcile in the UI. */ }
  return { error: 'Could not save your reaction. Refresh and try again.' }
}

'use client'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { snapshotSchema, type ArticleReactionReadResult } from './reactions'

// Reads bypass Next's serialized action queue so polling cannot block writes.
export async function readArticleReactions(postId: unknown): Promise<ArticleReactionReadResult> {
  const id = z.uuid().safeParse(postId)
  const failure = { error: 'Could not refresh reactions. Try again.' } as const
  if (!id.success) return failure
  try {
    const client = createClient()
    const { data: identity, error: sessionError } = await client.auth.getSession()
    if (sessionError) return failure
    const { data, error } = await client.rpc('get_article_reactions', { p_post_id: id.data })
    const snapshot = snapshotSchema.nullable().safeParse(data)
    if (error || !snapshot.success) return failure
    return { data: snapshot.data, viewerId: identity.session?.user.id ?? null }
  } catch { return failure }
}

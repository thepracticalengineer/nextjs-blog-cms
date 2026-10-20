'use client'

import { useEffect, useState } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { snapshotSchema, type ReactionReadResult } from './reactions'

/** Session identity is a UI hint only. RPC policies verify the signed JWT/MFA. */
export function useReactionSession(initialViewerId: string | null) {
  const [identity, setIdentity] = useState({ viewerId: initialViewerId, loading: false })
  useEffect(() => {
    const client = createClient()
    let active = true
    let receivedEvent = false
    let settled = false
    function finish(viewerId: string | null) {
      if (!active) return
      settled = true
      clearTimeout(timer)
      setIdentity(previous => previous.viewerId === viewerId ? previous : { viewerId, loading: false })
    }
    const timer = setTimeout(() => finish(null), 10_000)
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      receivedEvent = true
      finish(session?.user.id ?? null)
    })
    void client.auth.getSession().then(({ data, error }) => {
      if (!receivedEvent && !settled) finish(error ? null : data.session?.user.id ?? null)
    }).catch(() => { if (!receivedEvent && !settled) finish(null) })
    return () => { active = false; clearTimeout(timer); subscription.unsubscribe() }
  }, [])
  return identity
}

/** Browser RPC reads do not occupy Next's serialized server-action queue. */
export async function readCommentReactions(postId: unknown): Promise<ReactionReadResult> {
  const id = z.uuid().safeParse(postId)
  const failure = { error: 'Could not refresh reactions. Try again.' } as const
  if (!id.success) return failure
  try {
    const client = createClient()
    const { data: identity, error: sessionError } = await client.auth.getSession()
    if (sessionError) return failure
    const { data, error } = await client.rpc('get_comment_reactions', { p_post_id: id.data })
    const rows = z.array(snapshotSchema.extend({ comment_id: z.uuid() })).safeParse(data)
    if (error || !rows.success) return failure
    return {
      data: Object.fromEntries(rows.data.map(({ comment_id, ...snapshot }) => [comment_id, snapshot])),
      viewerId: identity.session?.user.id ?? null,
    }
  } catch { return failure }
}

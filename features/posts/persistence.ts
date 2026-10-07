import { createHash } from 'node:crypto'
import slugify from 'slugify'
import { createServiceClient } from '@/lib/supabase/service'
import type { Post } from './types'

// Sort object keys so JSON property order cannot change retry identity.
export function creationFingerprint(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical)
    if (!input || typeof input !== 'object') return input
    return Object.fromEntries(Object.entries(input)
      .sort(([a], [b]) => {
        if (a === b) return 0
        return a < b ? -1 : 1
      })
      .map(([key, item]) => [key, canonical(item)]))
  }
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

export function creationIdentity(scope: string, input: unknown, key?: string | null) {
  const fingerprint = creationFingerprint(input)
  return { requestKey: key ? `${scope}:${creationFingerprint(key)}` : undefined, fingerprint }
}

export async function savePostAtomic(input: {
  actorId: string; payload: Record<string, unknown>; postId?: string
  expectedUpdatedAt?: string | null; expectedStatus?: string
  tagIds?: string[]; tagNames?: string[]; requestKey?: string; fingerprint?: string
  chatId?: string; allowAdmin?: boolean
}) {
  const tagNames = input.tagNames?.map(name => ({ name: name.trim(), slug: slugify(name.trim(), { lower: true, strict: true }) }))
    .filter(tag => tag.name)
  if (tagNames?.some(tag => !tag.slug)) return { data: null, error: { code: 'INVALID_TAGS', message: 'Tag names must contain letters or numbers. No changes were applied.' } }
  const { data, error } = await createServiceClient().rpc('save_post_atomic', {
    p_actor_id: input.actorId, p_payload: input.payload, p_post_id: input.postId ?? null,
    p_expected_updated_at: input.expectedUpdatedAt ?? null, p_expected_status: input.expectedStatus ?? null,
    p_tag_ids: input.tagIds ?? null, p_tag_names: tagNames ?? null,
    p_request_key: input.requestKey ?? null, p_fingerprint: input.fingerprint ?? null,
    p_chat_id: input.chatId ?? null, p_allow_admin: input.allowAdmin ?? false,
  })
  if (!error && !data) return { data: null, error: { code: 'P0001', message: 'The post could not be saved.' } }
  return { data: error ? null : (data as { post: Post; replayed: boolean } | null), error }
}

// Replay before readiness/slug checks: the original post already owns its URL.
export async function findCreatedPost(actorId: string, identity: ReturnType<typeof creationIdentity>) {
  if (!identity.requestKey) return { post: null, error: null, status: 200 }
  const db = createServiceClient()
  const { data: receipt, error } = await db.from('post_creation_requests').select('fingerprint, post_id')
    .eq('actor_id', actorId).eq('request_key', identity.requestKey).maybeSingle()
  if (error) return { post: null, error: 'Could not check creation retry. Try again.', status: 503 }
  if (!receipt) return { post: null, error: null, status: 200 }
  if (receipt.fingerprint !== identity.fingerprint) return { post: null, error: 'This creation key was already used with different input.', status: 409 }
  const { data: post, error: postError } = await db.from('posts').select('*').eq('id', receipt.post_id).single()
  return { post: post as Post | null, error: postError || !post ? 'Could not load the previously created post.' : null, status: postError || !post ? 503 : 200 }
}

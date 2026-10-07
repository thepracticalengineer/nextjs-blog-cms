'use server'

import { z } from 'zod'
import { getProfile } from '@/lib/auth/session'
import { can, type Role } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { draftValuesSchema, type WorkingCopy } from './schema'

const identity = z.object({ documentId: z.uuid(), postId: z.uuid().nullable(), editorId: z.uuid() })
const saveSchema = identity.extend({
  values: draftValuesSchema, expectedRevision: z.uuid().nullable(), revision: z.uuid(),
  baseUpdatedAt: z.iso.datetime({ offset: true }).nullable(),
})
export type SaveWorkingCopyInput = z.infer<typeof saveSchema>
export type DraftResult = { data?: WorkingCopy; error?: string; conflict?: boolean }

async function context(documentId: string, postId: string | null, editorId: string) {
  const profile = await getProfile()
  if (!profile || profile.id !== editorId || !can(profile.role as Role, 'posts:create')) return null
  if (postId && documentId !== postId) return null
  const client = await createClient()
  if (postId) {
    const { data: post } = await client.from('posts').select('author_id').eq('id', postId).single()
    if (!post || (profile.role !== 'admin' && post.author_id !== profile.id)) return null
  }
  return { client, userId: profile.id }
}

export async function loadWorkingCopy(documentId: string, postId: string | null, editorId: string): Promise<DraftResult> {
  if (!identity.safeParse({ documentId, postId, editorId }).success) return { error: 'Invalid draft identity.' }
  const auth = await context(documentId, postId, editorId)
  if (!auth) return { error: 'Your session expired, the account changed, or this post is no longer editable. Sign in with the account that opened this editor; your writing is kept on this device.' }
  const { data, error } = await auth.client.from('post_working_copies').select('*')
    .eq('user_id', auth.userId).eq('document_id', documentId).maybeSingle()
  if (error) return { error: 'Draft recovery is unavailable. Your writing will be kept on this device.' }
  if (!data) return {}
  if (data.post_id !== postId) return { error: 'This recovery copy belongs to a different document.' }
  const values = draftValuesSchema.safeParse(data.values)
  if (!values.success) return { error: 'The saved working copy could not be read.' }
  return { data: { ...data, values: values.data } as WorkingCopy }
}

export async function saveWorkingCopy(input: SaveWorkingCopyInput): Promise<DraftResult> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success || JSON.stringify(parsed.data.values).length > 2_000_000) return { error: 'The draft could not be saved. Check its size and fields.' }
  const { documentId, postId, editorId, values, revision, expectedRevision, baseUpdatedAt } = parsed.data
  const auth = await context(documentId, postId, editorId)
  if (!auth) return { error: 'Your session expired, the account changed, or this post is no longer editable. Sign in with the account that opened this editor, then retry; your writing is kept on this device.' }
  const row = { user_id: auth.userId, document_id: documentId, post_id: postId, values, revision, base_updated_at: baseUpdatedAt, updated_at: new Date().toISOString() }
  const query = expectedRevision
    ? auth.client.from('post_working_copies').update(row).eq('user_id', auth.userId).eq('document_id', documentId).eq('revision', expectedRevision)
    : auth.client.from('post_working_copies').insert(row)
  const { data, error } = await query.select('*').single()
  if (!error && data) return { data: { ...data, values } as WorkingCopy }
  // An acknowledgement can be lost after a successful write. Repeating the same
  // request token must acknowledge it instead of reporting a false conflict.
  const current = await loadWorkingCopy(documentId, postId, editorId)
  if (current.data?.revision === revision) return current
  if (current.data || error?.code === '23505' || error?.code === 'PGRST116') {
    return { error: 'Another tab changed this working copy. Your writing is kept locally. Reopen the editor to compare and restore a copy.', conflict: true }
  }
  return { error: 'Autosave failed. Check your connection or sign in again, then retry. Your writing is kept on this device.' }
}

export async function discardWorkingCopy(documentId: string, postId: string | null, revision: string, editorId: string): Promise<{ error?: string }> {
  if (!identity.safeParse({ documentId, postId, editorId }).success || !z.uuid().safeParse(revision).success) return { error: 'Invalid draft identity.' }
  const auth = await context(documentId, postId, editorId)
  if (!auth) return { error: 'Sign in again before discarding the server copy.' }
  const { error } = await auth.client.from('post_working_copies').delete()
    .eq('user_id', auth.userId).eq('document_id', documentId).eq('revision', revision)
  return error ? { error: 'Could not discard the server copy. Retry when connected.' } : {}
}

'use server'

import { z } from 'zod'
import { getProfile } from '@/lib/auth/session'
import { can, type Role } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { cancelNewsletterSend } from '@/features/newsletter/actions'
import { refreshPostPaths } from './cache'

export type BulkPostItem = { id: string; updatedAt: string | null }
export type BulkPostResult = { id: string; status: 'success' | 'skipped' | 'failed'; message?: string; warning?: string }
export type BulkPostResponse = { results?: BulkPostResult[]; error?: string }
const batchSchema = z.array(z.object({ id: z.uuid(), updatedAt: z.string().min(1).max(100).nullable() })).min(1).max(50)

export async function bulkPostAction(action: 'delete' | 'unpublish', items: BulkPostItem[]): Promise<BulkPostResponse> {
  const profile = await getProfile()
  if (!profile || !can(profile.role as Role, action === 'unpublish' ? 'posts:publish' : 'posts:delete:own')) return { error: 'Unauthorized' }
  const parsed = batchSchema.safeParse(items)
  if (!['delete', 'unpublish'].includes(action) || !parsed.success || new Set(parsed.data.map(item => item.id)).size !== parsed.data.length) {
    return { error: 'Select between 1 and 50 unique posts from the current page.' }
  }
  const supabase = await createClient()
  const results: BulkPostResult[] = []
  const slugs: string[] = []
  for (const item of parsed.data) {
    try {
      const { data: post, error } = await supabase.from('posts').select('id, author_id, status, updated_at, slug').eq('id', item.id).single()
      if (error || !post || (post.author_id !== profile.id && profile.role !== 'admin')) {
        results.push({ id: item.id, status: 'failed', message: 'Post unavailable or unauthorized.' })
        continue
      }
      if (action === 'unpublish' && post.status !== 'published') {
        results.push({ id: item.id, status: 'skipped', message: 'Already unpublished.' })
        continue
      }
      if (post.updated_at !== item.updatedAt) {
        results.push({ id: item.id, status: 'failed', message: 'Post changed. Review the refreshed row before retrying.' })
        continue
      }
      // Repeat the version, status and ownership predicates on the write to
      // protect against changes between the read and mutation. RLS also applies.
      let query = action === 'delete'
        ? supabase.from('posts').delete()
        : supabase.from('posts').update({ status: 'draft', published_at: null })
      query = query.eq('id', item.id).eq('status', post.status)
      query = item.updatedAt === null ? query.is('updated_at', null) : query.eq('updated_at', item.updatedAt)
      if (profile.role !== 'admin') query = query.eq('author_id', profile.id)
      const { data: changed, error: writeError } = await query.select('id').single()
      if (writeError || !changed) {
        results.push({ id: item.id, status: 'failed', message: 'Post could not be changed. Refresh and try again.' })
        continue
      }
      const result: BulkPostResult = { id: item.id, status: 'success' }
      results.push(result)
      slugs.push(post.slug)
      if (action === 'unpublish') {
        try { await cancelNewsletterSend(item.id) } catch {
          result.warning = 'Unpublished, but newsletter cancellation could not be confirmed. Delivery checks block new batches while unpublished.'
        }
      }
    } catch {
      results.push({ id: item.id, status: 'failed', message: 'Post could not be changed. Refresh and try again.' })
    }
  }
  if (slugs.length) {
    try { refreshPostPaths(...slugs) } catch {
      for (const result of results.filter(result => result.status === 'success')) {
        result.warning = [result.warning, 'Saved, but cache refresh could not be confirmed.'].filter(Boolean).join(' ')
      }
    }
  }
  return { results }
}

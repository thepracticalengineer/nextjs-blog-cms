import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'
import { validatePublication } from '@/features/posts/publication'
import { getNewsletterDelayMinutes } from './config'

export async function scheduleNewsletterSend(postId: string, options: { resetPendingDelay?: boolean } = {}): Promise<void> {
  const delayMinutes = getNewsletterDelayMinutes()
  const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
  const supabase = createServiceClient()
  const { data: post, error: postError } = await supabase.from('posts').select('*').eq('id', postId).single()
  if (postError) throw postError
  if (post?.status !== 'published') throw new Error('The post must be published before scheduling a newsletter.')
  const fieldErrors = await validatePublication(supabase, post, true, postId)
  if (Object.keys(fieldErrors).length) throw new Error('The published post is not ready for newsletter delivery.')
  const { error } = await supabase
    .from('newsletter_sends')
    .upsert(
      { post_id: postId, scheduled_at: scheduledAt, status: 'pending' },
      { onConflict: 'post_id', ignoreDuplicates: true }
    )
  if (error) {
    console.error('[scheduleNewsletterSend] DB error:', error.message)
    throw new Error(`[scheduleNewsletterSend] DB error: ${error.message}`)
  }
  // A claim alone is not a provider handoff. Revoke its token when restoring
  // a pre-delivery failure so the old worker cannot send or overwrite the row.
  // Publish transitions also reset pending/preparing sends after failed cancellation.
  const { error: restoreError } = await supabase.from('newsletter_sends')
    .update({ status: 'pending', scheduled_at: scheduledAt, sending_started_at: null, dispatch_token: null })
    .eq('post_id', postId).in('status', options.resetPendingDelay ? ['pending', 'failed', 'sending'] : ['failed'])
    .is('delivery_started_at', null).is('sent_at', null)
  if (restoreError) throw new Error(`[scheduleNewsletterSend] Restore failed: ${restoreError.message}`)
}

export async function cancelNewsletterSend(postId: string): Promise<void> {
  // Retain the row for audit and deduplication. The dispatcher independently
  // checks current publication state, including already-claimed sends.
  const { error } = await createServiceClient().from('newsletter_sends')
    .update({ status: 'failed' }).eq('post_id', postId).in('status', ['pending', 'sending'])
  if (error) throw error
}

'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { validatePublication } from '@/features/posts/publication'

export async function scheduleNewsletterSend(postId: string): Promise<void> {
  const parsed = parseInt(process.env.NEWSLETTER_DELAY_MINUTES ?? '', 10)
  const delayMinutes = Number.isFinite(parsed) && parsed >= 0 ? parsed : 60
  const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
  const supabase = createServiceClient()
  const { data: post } = await supabase.from('posts').select('*').eq('id', postId).single()
  if (!post || post.status !== 'published') return
  const fieldErrors = await validatePublication(supabase, post, true, postId)
  if (Object.keys(fieldErrors).length) return
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
}

export async function cancelNewsletterSend(postId: string): Promise<void> {
  // Retain the row for audit and deduplication. The dispatcher independently
  // checks current publication state, including already-claimed sends.
  const { error } = await createServiceClient().from('newsletter_sends')
    .update({ status: 'failed' }).eq('post_id', postId).in('status', ['pending', 'sending'])
  if (error) console.error('[cancelNewsletterSend] Failed to cancel send:', error.message)
}

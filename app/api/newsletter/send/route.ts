import { randomUUID, timingSafeEqual } from 'crypto'
import { validatePublication } from '@/features/posts/publication'
import { type NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNewsletterEmail } from '@/lib/notifications/newsletter'
import type { NewsletterSubscription } from '@/features/newsletter/types'
import type { PostEmailData } from '@/lib/notifications/newsletter'

const EMAIL_BATCH_SIZE = 10

function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

async function sendInBatches(
  subscribers: NewsletterSubscription[],
  post: PostEmailData,
  canContinue: () => Promise<boolean>,
  markDeliveryStarted: () => Promise<boolean>
): Promise<{ failures: number; stopped: boolean }> {
  let failures = 0
  for (let i = 0; i < subscribers.length; i += EMAIL_BATCH_SIZE) {
    // Unpublishing or cancellation may happen while a batch is in flight.
    if (!await canContinue()) return { failures, stopped: true }
    if (i === 0 && !await markDeliveryStarted()) return { failures, stopped: true }
    const batch = subscribers.slice(i, i + EMAIL_BATCH_SIZE)
    const results = await Promise.allSettled(batch.map((sub) => sendNewsletterEmail(sub, post)))
    failures += results.filter((r) => r.status === 'rejected').length
  }
  return { failures, stopped: false }
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  const envSecret = process.env.WEBHOOK_SECRET

  if (!envSecret) {
    console.error('[newsletter/send] WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  if (!secret || !secureCompare(secret, envSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Stale preparation is retryable. Revoke ownership before another worker claims it.
  // A persisted handoff marker must never be retried automatically.
  const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { error: preparationError } = await supabase.from('newsletter_sends')
    .update({ status: 'pending', sending_started_at: null, dispatch_token: null })
    .eq('status', 'sending').is('delivery_started_at', null).is('sent_at', null)
    .lt('sending_started_at', stuckCutoff)
  if (preparationError) return NextResponse.json({ error: 'DB error' }, { status: 500 })
  const { error: recoveryError } = await supabase
    .from('newsletter_sends')
    .update({ status: 'failed' })
    .eq('status', 'sending')
    .lt('sending_started_at', stuckCutoff)
  if (recoveryError) {
    console.error('[newsletter/send] Failed to recover stuck sends:', recoveryError.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // Fetch pending sends that are due, then claim only the ones we actually update
  // (concurrent invocations will fail to claim rows already set to 'sending')
  const { data: pendingSends, error: fetchError } = await supabase
    .from('newsletter_sends')
    .select('id, post_id')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .limit(10)

  if (fetchError) {
    console.error('[newsletter/send] Failed to fetch pending sends:', fetchError.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  if (!pendingSends || pendingSends.length === 0) {
    return NextResponse.json({ dispatched: 0 })
  }

  const candidateIds = pendingSends.map((s) => s.id)

  const dispatchToken = randomUUID()
  // Claim only rows still in 'pending'; .select() returns rows actually updated
  const { data: claimedSends, error: claimError } = await supabase
    .from('newsletter_sends')
    .update({ status: 'sending', sending_started_at: new Date().toISOString(), dispatch_token: dispatchToken })
    .in('id', candidateIds)
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .select('id, post_id')

  if (claimError) {
    console.error('[newsletter/send] Failed to claim sends:', claimError.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  if (!claimedSends || claimedSends.length === 0) {
    return NextResponse.json({ dispatched: 0 })
  }

  let response: NextResponse
  try {
    response = await processClaimedSends(supabase, claimedSends, dispatchToken)
  } catch (error) {
    console.error('[newsletter/send] Dispatch failed:', error)
    response = NextResponse.json({ error: 'Dispatch failed' }, { status: 500 })
  }
  // Release all unprocessed/pre-handoff rows even on an early return or exception.
  // Ownership + handoff filters prevent stale workers from clearing a newer claim.
  const { error: releaseError } = await supabase.from('newsletter_sends')
    .update({ status: 'failed', sending_started_at: null, dispatch_token: null })
    .eq('dispatch_token', dispatchToken).in('status', ['sending', 'failed'])
    .is('delivery_started_at', null).is('sent_at', null)
  if (releaseError) {
    console.error('[newsletter/send] Failed to release unstarted claims:', releaseError.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
  return response
}

async function processClaimedSends(
  supabase: ReturnType<typeof createServiceClient>,
  claimedSends: { id: string; post_id: string }[],
  dispatchToken: string
): Promise<NextResponse> {
  // Fetch active subscribers once for all sends in this batch
  const { data: subscribers, error: subError } = await supabase
    .from('newsletter_subscriptions')
    .select('id, email, unsubscribe_token, subscribed_at, unsubscribed_at')
    .is('unsubscribed_at', null)

  if (subError) {
    console.error('[newsletter/send] Failed to fetch subscribers:', subError.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const activeSubscribers = (subscribers ?? []) as NewsletterSubscription[]
  if (activeSubscribers.length && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)) {
    throw new Error('Newsletter email provider is not configured')
  }
  let dispatched = 0

  for (const send of claimedSends) {
    const postData = await getDeliverablePost(supabase, send.post_id)
    if (!postData) continue // Request cleanup releases this unstarted claim.

    // Deliver the validated snapshot consistently, even if a reviewed live edit occurs.
    const { failures, stopped } = await sendInBatches(activeSubscribers, postData, async () => {
      const [currentPost, currentSend] = await Promise.all([
        supabase.from('posts').select('status').eq('id', send.post_id).single(),
        supabase.from('newsletter_sends').select('status, dispatch_token').eq('id', send.id).single(),
      ])
      return !currentPost.error && !currentSend.error && currentPost.data?.status === 'published' &&
        currentSend.data?.status === 'sending' && currentSend.data?.dispatch_token === dispatchToken
    }, async () => {
      // Persist possible handoff before the first provider call. A canceled,
      // restored or recovered row no longer belongs to this worker.
      const { data, error } = await supabase.from('newsletter_sends')
        .update({ delivery_started_at: new Date().toISOString() })
        .eq('id', send.id).eq('dispatch_token', dispatchToken).eq('status', 'sending')
        .is('delivery_started_at', null).select('id')
      if (error) throw error
      return !!data?.length
    })

    if (stopped) {
      console.warn(`[newsletter/send] Send ${send.id} stopped: publication withdrawn, queue canceled, or state unavailable`)
    } else if (failures > 0) {
      console.error(`[newsletter/send] ${failures}/${activeSubscribers.length} emails failed for send ${send.id}`)
    }
    // Do not overwrite a cancellation that raced with the final email batch.
    const sent = !stopped && failures === 0
    const { data: completed, error: completionError } = await supabase.from('newsletter_sends')
      .update(sent ? { status: 'sent', sent_at: new Date().toISOString() } : { status: 'failed' })
      .eq('id', send.id).eq('dispatch_token', dispatchToken).eq('status', 'sending').select('id')
    if (completionError) {
      console.error('[newsletter/send] Failed to record delivery outcome:', completionError.message)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }
    if (sent && completed?.length) dispatched++
  }

  return NextResponse.json({ dispatched })
}

async function getDeliverablePost(supabase: ReturnType<typeof createServiceClient>, postId: string): Promise<PostEmailData | null> {
  const { data: post, error } = await supabase.from('posts').select('*').eq('id', postId).single()
  if (error || !post) {
    console.error(`[newsletter/send] Skipping post ${postId}: post unavailable`)
    return null
  }
  if (post.status !== 'published') {
    console.error(`[newsletter/send] Skipping post ${postId}: post unpublished`)
    return null
  }
  const fieldErrors = await validatePublication(supabase, post, true, postId)
  if (Object.keys(fieldErrors).length) {
    console.error(`[newsletter/send] Skipping post ${postId}: publication validation failed`, fieldErrors)
    return null
  }
  return post
}

import { timingSafeEqual } from 'crypto'
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
  canContinue: () => Promise<boolean>
): Promise<{ failures: number; stopped: boolean }> {
  let failures = 0
  for (let i = 0; i < subscribers.length; i += EMAIL_BATCH_SIZE) {
    // Unpublishing or cancellation may happen while a batch is in flight.
    if (!await canContinue()) return { failures, stopped: true }
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

  // Recovery: mark sends stuck in 'sending' for >10 minutes as failed
  const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  await supabase
    .from('newsletter_sends')
    .update({ status: 'failed' })
    .eq('status', 'sending')
    .lt('sending_started_at', stuckCutoff)

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

  // Claim only rows still in 'pending'; .select() returns rows actually updated
  const { data: claimedSends, error: claimError } = await supabase
    .from('newsletter_sends')
    .update({ status: 'sending', sending_started_at: new Date().toISOString() })
    .in('id', candidateIds)
    .eq('status', 'pending')
    .select('id, post_id')

  if (claimError) {
    console.error('[newsletter/send] Failed to claim sends:', claimError.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  if (!claimedSends || claimedSends.length === 0) {
    return NextResponse.json({ dispatched: 0 })
  }

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
  let dispatched = 0

  for (const send of claimedSends) {
    const { data: postData, error: postError } = await supabase
      .from('posts')
      .select('*')
      .eq('id', send.post_id)
      .single()

    const fieldErrors = postData?.status === 'published'
      ? await validatePublication(supabase, postData, true, send.post_id) : {}
    if (postError || !postData || postData.status !== 'published' || Object.keys(fieldErrors).length > 0) {
      const reason = postError || !postData ? 'post unavailable'
        : postData.status !== 'published' ? 'post unpublished' : 'publication validation failed'
      console.error(`[newsletter/send] Skipping post ${send.post_id}: ${reason}`, fieldErrors)
      await supabase.from('newsletter_sends').update({ status: 'failed' }).eq('id', send.id)
      continue
    }

    // Deliver the validated snapshot consistently, even if a reviewed live edit occurs.
    const { failures, stopped } = await sendInBatches(activeSubscribers, postData, async () => {
      const [currentPost, currentSend] = await Promise.all([
        supabase.from('posts').select('status').eq('id', send.post_id).single(),
        supabase.from('newsletter_sends').select('status').eq('id', send.id).single(),
      ])
      return !currentPost.error && !currentSend.error && currentPost.data?.status === 'published' &&
        currentSend.data?.status === 'sending'
    })

    if (stopped) {
      console.warn(`[newsletter/send] Send ${send.id} stopped: publication withdrawn, queue canceled, or state unavailable`)
      await supabase.from('newsletter_sends').update({ status: 'failed' }).eq('id', send.id)
    } else if (failures > 0) {
      console.error(`[newsletter/send] ${failures}/${activeSubscribers.length} emails failed for send ${send.id}`)
      await supabase.from('newsletter_sends').update({ status: 'failed' }).eq('id', send.id)
    } else {
      await supabase
        .from('newsletter_sends')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', send.id)
      dispatched++
    }
  }

  return NextResponse.json({ dispatched })
}

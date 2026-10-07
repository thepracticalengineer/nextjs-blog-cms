// features/newsletter/queries.ts
import { createServiceClient } from '@/lib/supabase/service'
import type { NewsletterSubscription, NewsletterSend, SubscriberStats, PostNewsletterState } from './types'
import { getNewsletterDelayMinutes } from './config'

// Call only after authorizing access to the post. No subscriber data is exposed.
export async function getPostNewsletterState(postId?: string): Promise<PostNewsletterState> {
  const delayMinutes = getNewsletterDelayMinutes()
  if (!postId) return { delayMinutes, send: null }
  try {
    const { data, error } = await createServiceClient().from('newsletter_sends')
      .select('id, post_id, status, scheduled_at, sending_started_at, sent_at, created_at')
      .eq('post_id', postId).maybeSingle()
    if (error) throw error
    return { delayMinutes, send: data as NewsletterSend | null }
  } catch (error) {
    console.error('[getPostNewsletterState] Failed to read newsletter status:', error)
    return { delayMinutes, send: null, error: 'Newsletter status is unavailable. Refresh status before retrying.' }
  }
}

export async function getSubscriberStats(): Promise<SubscriberStats> {
  const supabase = createServiceClient()
  const [
    { count: active, error: e1 },
    { count: unsubscribed, error: e2 },
    { count: sends_dispatched, error: e3 },
  ] = await Promise.all([
    supabase
      .from('newsletter_subscriptions')
      .select('*', { count: 'exact', head: true })
      .is('unsubscribed_at', null),
    supabase
      .from('newsletter_subscriptions')
      .select('*', { count: 'exact', head: true })
      .not('unsubscribed_at', 'is', null),
    supabase
      .from('newsletter_sends')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent'),
  ])
  const firstError = e1 ?? e2 ?? e3
  if (firstError) throw firstError
  return {
    active: active ?? 0,
    sends_dispatched: sends_dispatched ?? 0,
    unsubscribed: unsubscribed ?? 0,
  }
}

export async function getScheduledSends(): Promise<(NewsletterSend & { post_title: string })[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('newsletter_sends')
    .select('*, post:posts(title)')
    .in('status', ['pending', 'sending'])
    .order('scheduled_at', { ascending: true })
  if (error) throw error
  type RawSendRow = NewsletterSend & { post: { title: string } | null }
  return (data as RawSendRow[] ?? []).map((row) => ({
    ...row,
    post_title: row.post?.title ?? 'Unknown post',
  }))
}

export async function getRecentSubscribers(limit = 20): Promise<NewsletterSubscription[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('newsletter_subscriptions')
    .select('*')
    .order('subscribed_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as NewsletterSubscription[]
}

export async function getActiveSubscribers(): Promise<NewsletterSubscription[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('newsletter_subscriptions')
    .select('*')
    .is('unsubscribed_at', null)
  if (error) throw error
  return (data ?? []) as NewsletterSubscription[]
}

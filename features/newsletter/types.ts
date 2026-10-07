export type NewsletterSubscription = {
  id: string
  email: string
  subscribed_at: string
  unsubscribed_at: string | null
  unsubscribe_token: string
}

export type NewsletterSend = {
  id: string
  post_id: string
  scheduled_at: string
  status: 'pending' | 'sending' | 'sent' | 'failed'
  sending_started_at: string | null
  sent_at: string | null
  created_at: string
}

export type SubscriberStats = {
  active: number
  sends_dispatched: number
  unsubscribed: number
}

export type PostNewsletterState = {
  delayMinutes: number
  send: NewsletterSend | null
  error?: string
}

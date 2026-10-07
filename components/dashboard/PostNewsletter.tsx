'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { retryNewsletterScheduling } from '@/features/posts/actions'
import type { PostNewsletterState } from '@/features/newsletter/types'

interface PostNewsletterProps {
  state: PostNewsletterState
  postId?: string
  editorId?: string
  published: boolean
  disabled: boolean
  warning: string | null
  onScheduled: () => void
}

function formatTime(value: string): string {
  // A fixed zone keeps server rendering and hydration consistent.
  return `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

export function PostNewsletter({ state, postId, editorId, published, disabled, warning, onScheduled }: PostNewsletterProps) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  const [refreshing, startRefresh] = useTransition()
  const [retryError, setRetryError] = useState<string | null>(null)
  const send = state.send
  const claimed = !!(send?.sending_started_at || send?.sent_at || send?.status === 'sent' || send?.status === 'sending')
  const canRetry = published && !state.error && (!send || (send.status === 'failed' && !claimed))
  const status = state.error ? 'Status unavailable' : !send ? 'Not scheduled'
    : send.status === 'pending' ? 'Queued' : send.status === 'sending' ? 'Sending'
      : send.status === 'sent' ? 'Sent' : !published && !claimed ? 'Canceled' : 'Failed'
  const error = retryError || state.error

  async function retry() {
    if (!postId || retrying) return
    setRetrying(true)
    setRetryError(null)
    try {
      const result = await retryNewsletterScheduling(postId, editorId)
      if (result.error) setRetryError(result.error)
      else onScheduled()
      startRefresh(() => router.refresh())
    } catch {
      setRetryError('Newsletter scheduling could not be confirmed. Refresh status before trying again.')
    } finally { setRetrying(false) }
  }

  return (
    <section aria-label="Newsletter notification" aria-live="polite" className="space-y-3 text-xs leading-relaxed">
      <p className="font-medium">{status}</p>
      <p className="text-muted-foreground">Configured delay: {state.delayMinutes} {state.delayMinutes === 1 ? 'minute' : 'minutes'}. Delivery starts on a dispatcher run after that delay.</p>
      {!claimed && !published && <p>Publishing will notify active subscribers. Unpublishing cancels the queued notification; republishing starts a fresh delay.</p>}
      {send?.status === 'pending' && <p>Queued for <time dateTime={send.scheduled_at}>{formatTime(send.scheduled_at)}</time> or the next dispatcher run.</p>}
      {send?.status === 'sent' && send.sent_at && <p>Sent at <time dateTime={send.sent_at}>{formatTime(send.sent_at)}</time>.</p>}
      {claimed && <p>Delivery has already started or completed. Republish and retry will not send this newsletter again, to avoid duplicate emails.</p>}
      {published && send?.status !== 'sent' && <p>Unpublishing stops new batches. Emails already handed off cannot be recalled.</p>}
      {send?.status === 'failed' && claimed && <p className="text-muted-foreground">Delivery may be partial. A previously started send cannot be safely restarted.</p>}
      {warning && <p role="alert" className="text-amber-700 dark:text-amber-400">{warning}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {postId && (
        <div className="flex flex-wrap gap-2">
          {canRetry && <Button type="button" variant="outline" size="sm" disabled={disabled || retrying || refreshing} onClick={retry}>{retrying ? 'Scheduling…' : 'Retry newsletter scheduling'}</Button>}
          <Button type="button" variant="ghost" size="sm" disabled={disabled || retrying || refreshing} onClick={() => { setRetryError(null); startRefresh(() => router.refresh()) }}>{refreshing ? 'Refreshing…' : 'Refresh status'}</Button>
        </div>
      )}
    </section>
  )
}

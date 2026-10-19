'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { reactions, type Reaction } from '../reactions'
import { useCommentReactions } from './comment-reaction-context'

export function CommentReactions({ commentId }: { commentId: string }) {
  const context = useCommentReactions()
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const [feedback, setFeedback] = useState('')
  const [failed, setFailed] = useState<{ desired: Reaction | null; error: string } | null>(null)
  const [guest, setGuest] = useState(false)
  if (!context) return null
  const snapshot = context.data[commentId]

  async function save(desired: Reaction | null) {
    if (!context || busy.current) return
    if (!context.viewerId) { setGuest(true); return }
    busy.current = true
    setPending(true)
    setFailed(null)
    setFeedback('Saving reaction…')
    try {
      const result = await context.save(commentId, desired)
      if (result.error !== undefined) {
        setFailed({ desired, error: result.error })
        setFeedback('Reaction could not be confirmed. Counts have been refreshed where possible.')
      } else {
        setFeedback(desired ? `${reactions.find(item => item.type === desired)!.label} reaction saved.` : 'Reaction removed.')
      }
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  if (!snapshot) return <p className="mt-3 text-xs text-muted-foreground" role="status">
    {context.error ? 'Reactions unavailable.' : 'This comment is no longer available for reactions.'}
  </p>
  return <div className="mt-3 flex flex-col gap-2">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Comment reactions" aria-busy={pending}>
      {reactions.map(({ type, emoji, label }) => {
        const count = snapshot.counts[type]
        return <Button key={type} variant={snapshot.selection === type ? 'secondary' : 'outline'}
          className="min-h-11 min-w-11" size="sm" aria-pressed={snapshot.selection === type}
          title={label}
          aria-label={`${label}: ${count} ${count === 1 ? 'reaction' : 'reactions'}`}
          disabled={pending || context.loading}
          onClick={() => void save(snapshot.selection === type ? null : type)}>
          <span aria-hidden="true">{emoji}</span><span className="tabular-nums" aria-hidden="true">{count}</span>
        </Button>
      })}
    </div>
    {guest && <p className="text-xs text-muted-foreground">
      <a className="underline underline-offset-4" href="/login">Sign in to react</a> to choose a reaction.
    </p>}
    {failed && <div className="flex flex-wrap items-center gap-2 text-xs" role="alert">
      <span>{failed.error}</span><Button variant="link" size="sm" onClick={() => void save(failed.desired)}>Retry reaction</Button>
    </div>}
    <span className="sr-only" role="status" aria-live="polite">{feedback}</span>
  </div>
}

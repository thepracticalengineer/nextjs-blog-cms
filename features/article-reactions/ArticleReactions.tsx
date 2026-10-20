'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Popover } from '@base-ui/react/popover'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { Toggle } from '@base-ui/react/toggle'
import { HeartPlusIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useReactionSession } from '@/features/comments/reaction-client'
import { reactions, type ArticleReaction, type ArticleReactionSnapshot } from './reactions'
import { useArticleReactions } from './useArticleReactions'

type Props = { postId: string; returnPath: string; initialData: ArticleReactionSnapshot | null; initialViewerId: string | null }

export function ArticleReactions(props: Props) {
  const identity = useReactionSession(props.initialViewerId)
  // Discard pending work/private state whenever the article or viewer changes.
  return <ReactionState key={`${props.postId}:${identity.loading ? 'loading' : identity.viewerId ?? 'guest'}`} {...props} {...identity} />
}

function ReactionState({ returnPath, ...props }: Props & { viewerId: string | null; loading: boolean }) {
  const state = useArticleReactions(props)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const guestTrigger = useRef<HTMLButtonElement | null>(null)
  const buttons = useRef<Partial<Record<ArticleReaction, HTMLButtonElement | null>>>({})
  const total = state.data ? Object.values(state.data.counts).reduce((sum, count) => sum + count, 0) : null
  const selections = state.data?.selections ?? []
  const next = encodeURIComponent(returnPath)

  function choose(values: ArticleReaction[]) {
    const reaction = reactions.find(({ type }) => selections.includes(type) !== values.includes(type))?.type
    if (!reaction) return
    if (!props.viewerId) {
      guestTrigger.current = buttons.current[reaction] ?? null
      setLoginOpen(true)
      return
    }
    void state.save(reaction, values.includes(reaction))
  }

  return <section id="article-reactions" aria-label="Article reactions" className="my-10 flex scroll-mt-24 flex-col gap-3">
    <div className="flex flex-wrap items-center gap-3">
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <Popover.Root open={pickerOpen} onOpenChange={open => { if (!loginOpen) setPickerOpen(open) }}>
          <Popover.Trigger render={<Button variant="outline" className="min-h-11 rounded-full" />} disabled={!state.data || props.loading}>
            <HeartPlusIcon data-icon="inline-start" aria-hidden="true" />Add reaction
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner sideOffset={8} align="start" className="isolate">
              <Popover.Popup className="w-max max-w-[calc(100vw-2rem)] rounded-xl bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
                <Popover.Title className="text-sm font-medium">How did this article land?</Popover.Title>
                <Popover.Description className="mb-3 mt-1 text-xs text-muted-foreground">Choose any that fit. Select again to remove.</Popover.Description>
                <ToggleGroup multiple value={selections} onValueChange={choose} disabled={state.pending || props.loading || !state.data}
                  aria-label="Choose article reactions" aria-busy={state.pending} className="flex gap-1">
                  {reactions.map(({ type, emoji, label }) => {
                    const count = state.data?.counts[type] ?? 0
                    return <Toggle key={type} value={type} ref={node => { buttons.current[type] = node }}
                      render={<Button variant={selections.includes(type) ? 'secondary' : 'ghost'} />}
                      className="min-h-16 min-w-11 flex-col gap-1 rounded-lg px-2"
                      title={label} aria-label={`${label}: ${count} ${count === 1 ? 'reaction' : 'reactions'}`}>
                      <span aria-hidden="true" className="text-2xl">{emoji}</span>
                      <span aria-hidden="true" className="tabular-nums text-xs">{count}</span>
                    </Toggle>
                  })}
                </ToggleGroup>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
        <DialogContent finalFocus={guestTrigger} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Log in to continue</DialogTitle>
            <DialogDescription>Join the conversation and show the author what resonated with you.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Link className={cn(buttonVariants(), "min-h-11")} href={`/login?next=${next}`}>Log in</Link>
            <Link className={cn(buttonVariants({ variant: "outline" }), "min-h-11")} href={`/register?next=${next}`}>Create account</Link>
            <DialogClose render={<Button variant="ghost" className="min-h-11" />}>Close</DialogClose>
          </div>
        </DialogContent>
      </Dialog>
      <span className="text-sm tabular-nums text-muted-foreground" aria-live="polite" aria-atomic="true">
        {total === null ? 'Reactions unavailable' : `${total} ${total === 1 ? 'reaction' : 'reactions'}`}
      </span>
    </div>
    {state.error && <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>{state.error}</span><Button variant="link" size="sm" onClick={() => void state.refresh()}>Refresh reactions</Button>
    </div>}
    {state.failed && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
      <span>{state.failed.error}</span>
      {state.failed.retryable && <Button variant="link" size="sm" disabled={state.pending}
        onClick={() => { if (state.failed) void state.save(state.failed.reaction, state.failed.selected) }}>Retry reaction</Button>}
    </div>}
    <span className="sr-only" role="status" aria-live="polite">{state.feedback}</span>
  </section>
}

'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { setCommentReaction } from '../reaction-actions'
import { readCommentReactions, useReactionSession } from '../reaction-client'
import type { Reaction, ReactionResult, ReactionSnapshots } from '../reactions'

import { ReactionContext } from './comment-reaction-context'

async function withinDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Reaction request timed out')), 15_000)
    })])
  } finally { clearTimeout(timer) }
}

type Props = { postId: string; initialData: ReactionSnapshots | null; initialViewerId: string | null; children: ReactNode; returnPath?: string }

export function CommentReactionProvider(props: Props) {
  const { viewerId, loading } = useReactionSession(props.initialViewerId)
  // Remount on identity changes: pending requests and own selections cannot
  // cross accounts, even when a response ignores cancellation.
  return <ReactionState key={loading ? 'loading' : viewerId ?? 'guest'} {...props} viewerId={viewerId} loading={loading} />
}

function ReactionState({ postId, initialData, initialViewerId, viewerId, loading, children, returnPath }: Props & { viewerId: string | null; loading: boolean }) {
  const [data, setData] = useState<ReactionSnapshots>(() => Object.fromEntries(
    Object.entries(initialData ?? {}).map(([id, snapshot]) => [id, {
      ...snapshot, selection: !loading && viewerId === initialViewerId ? snapshot.selection : null,
    }]),
  ))
  const [seenInitial, setSeenInitial] = useState(initialData)
  if (seenInitial !== initialData) {
    setSeenInitial(initialData)
    // RSC can append a newly posted comment without remounting this provider.
    // Merge only newly introduced IDs, preserving in-flight/local selections.
    const added = Object.entries(initialData ?? {}).filter(([id]) => !(id in (seenInitial ?? {})))
    if (added.length) setData(previous => ({ ...previous, ...Object.fromEntries(added.filter(([id]) => !(id in previous)).map(([id, snapshot]) => [id, {
      ...snapshot, selection: !loading && viewerId === initialViewerId ? snapshot.selection : null,
    }])) }))
  }
  const [error, setError] = useState<string | null>(initialData ? null : 'Reactions are unavailable. Try refreshing.')
  const live = useRef(true)
  const revision = useRef(0)
  const writes = useRef(0)
  const inFlight = useRef<Promise<void> | null>(null)
  const invalidateReads = useCallback(() => { revision.current++; inFlight.current = null }, [])
  const refresh = useCallback((): Promise<void> => {
    if (writes.current) return Promise.resolve()
    if (inFlight.current) return inFlight.current
    const operation = (async () => {
      const request = ++revision.current
      try {
        const result = await withinDeadline(readCommentReactions(postId))
        if (!live.current || request !== revision.current) return
        if (result.error !== undefined) { setError(result.error); return }
        setData(Object.fromEntries(Object.entries(result.data).map(([id, snapshot]) => [id, {
          ...snapshot, selection: result.viewerId === viewerId ? snapshot.selection : null,
        }])))
        setError(null)
      } catch {
        if (live.current && request === revision.current) setError('Could not refresh reactions. Try again.')
      }
    })()
    inFlight.current = operation
    void operation.finally(() => { if (inFlight.current === operation) inFlight.current = null })
    return operation
  }, [postId, viewerId])

  useEffect(() => {
    live.current = true
    let active = true
    // Load once after subscribing; cleanup cancels a Strict Mode throwaway mount.
    void Promise.resolve().then(() => { if (active && !loading) void refresh() })
    let focusTimer: ReturnType<typeof setTimeout> | undefined
    const focus = () => {
      if (document.visibilityState !== 'visible' || loading) return
      clearTimeout(focusTimer)
      focusTimer = setTimeout(() => void refresh(), 100)
    }
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', focus)
    const timer = setInterval(focus, 30_000)
    return () => {
      live.current = false
      invalidateReads()
      active = false
      clearTimeout(focusTimer)
      clearInterval(timer)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', focus)
    }
  }, [initialData, loading, refresh, invalidateReads])

  async function save(id: string, desired: Reaction | null): Promise<ReactionResult> {
    writes.current++
    invalidateReads() // A read begun before this write must never overwrite it.
    let result: ReactionResult
    try { result = await withinDeadline(setCommentReaction(id, desired)) }
    catch { result = { error: 'Could not save your reaction. Refresh and try again.' } }
    writes.current--
    revision.current++
    if (live.current) {
      if (result.data) setData(previous => ({ ...previous, [id]: result.data }))
      // Reconcile uncertain outcomes and other viewers' concurrent changes.
      if (result.error !== undefined && !writes.current) void refresh()
    }
    return result
  }

  return <ReactionContext.Provider value={{ data, viewerId, loading, error, refresh, save, signInHref: `/login?next=${encodeURIComponent(returnPath ?? '/blog#comments')}` }}>
    {error && <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
      <span>{error}</span><button type="button" className="underline underline-offset-4" onClick={() => void refresh()}>Refresh reactions</button>
    </div>}
    {children}
  </ReactionContext.Provider>
}

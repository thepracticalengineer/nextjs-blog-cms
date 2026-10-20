'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { setArticleReaction } from './actions'
import { readArticleReactions } from './client'
import type { ArticleReaction, ArticleReactionResult, ArticleReactionSnapshot } from './reactions'

async function withinDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Reaction request timed out')), 15_000)
    })])
  } finally { clearTimeout(timer) }
}

type Input = { postId: string; initialData: ArticleReactionSnapshot | null; initialViewerId: string | null; viewerId: string | null; loading: boolean }
type Failed = { reaction: ArticleReaction; selected: boolean; error: string; retryable: boolean }

export function useArticleReactions({ postId, initialData, initialViewerId, viewerId, loading }: Input) {
  const [data, setData] = useState<ArticleReactionSnapshot | null>(() => initialData && {
    ...initialData, selections: viewerId === initialViewerId ? initialData.selections : [],
  })
  const [error, setError] = useState<string | null>(initialData ? null : 'Reactions are unavailable. Try refreshing.')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState<Failed | null>(null)
  const [feedback, setFeedback] = useState('')
  const live = useRef(true)
  const busy = useRef(false)
  const revision = useRef(0)
  const inFlight = useRef<Promise<void> | null>(null)
  const invalidateReads = useCallback(() => { revision.current++; inFlight.current = null }, [])

  const refresh = useCallback((): Promise<void> => {
    if (busy.current) return Promise.resolve()
    if (inFlight.current) return inFlight.current
    const request = ++revision.current
    const operation = (async () => {
      try {
        const result = await withinDeadline(readArticleReactions(postId))
        if (!live.current || request !== revision.current) return
        if (result.error !== undefined) { setError(result.error); return }
        setData(result.data && { ...result.data, selections: result.viewerId === viewerId ? result.data.selections : [] })
        setError(result.data ? null : 'This article is no longer available for reactions.')
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
    void Promise.resolve().then(() => { if (active && !loading) void refresh() })
    let focusTimer: ReturnType<typeof setTimeout> | undefined
    const focus = () => {
      if (document.visibilityState !== 'visible' || loading) return
      clearTimeout(focusTimer)
      focusTimer = setTimeout(() => void refresh(), 100)
    }
    const timer = setInterval(focus, 30_000)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', focus)
    return () => {
      live.current = false
      active = false
      invalidateReads()
      clearTimeout(focusTimer)
      clearInterval(timer)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', focus)
    }
  }, [loading, refresh, invalidateReads])

  async function save(reaction: ArticleReaction, selected: boolean) {
    if (busy.current || !viewerId || loading) return
    busy.current = true
    invalidateReads()
    setPending(true)
    setFailed(null)
    setFeedback('Saving reaction…')
    let result: ArticleReactionResult
    try { result = await withinDeadline(setArticleReaction(postId, reaction, selected)) }
    catch { result = { error: 'Could not save your reaction. Refresh and try again.' } }
    busy.current = false
    revision.current++
    if (!live.current) return
    setPending(false)
    if (result.error !== undefined) {
      setFailed({ reaction, selected, error: result.error, retryable: result.retryable !== false })
      setFeedback('Reaction could not be confirmed. Refreshing counts.')
      void refresh()
    } else {
      setData(result.data)
      setError(null)
      setFeedback(selected ? 'Reaction saved.' : 'Reaction removed.')
    }
  }

  return { data, error, pending, failed, feedback, refresh, save }
}

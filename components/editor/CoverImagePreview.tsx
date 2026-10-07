'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { validateImageUrl } from '@/features/posts/media/client'

// Mount with key=src: a failed previous image must not hide its replacement.
export function CoverImagePreview({ src, alt, editorId }: { src: string; alt: string; editorId: string }) {
  const [approved, setApproved] = useState(false)
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void validateImageUrl(src, editorId, controller.signal)
      .then(() => { if (!controller.signal.aborted) setApproved(true) })
      .catch(error => { if (!controller.signal.aborted) setError((error as Error).message) })
    }, 500)
    return () => { clearTimeout(timer); controller.abort() }
  }, [src, editorId, attempt])
  if (error) return <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button type="button" size="sm" variant="outline" onClick={() => { setError(undefined); setApproved(false); setAttempt(value => value + 1) }}>Retry cover preview</Button></div>
  if (!approved) return <p role="status" className="text-xs text-muted-foreground">Checking cover image…</p>
  return <div className="aspect-video overflow-hidden rounded-lg bg-muted">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={alt} className="h-full w-full object-cover" onError={() => setError('The cover image could not be loaded. Check its URL and public access, replace it, or retry.')} />
  </div>
}

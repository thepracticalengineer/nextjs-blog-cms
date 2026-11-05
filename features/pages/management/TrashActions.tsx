'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { writePage } from '@/features/pages/actions'
import type { PageWrite } from '../schema'

/** Restore or permanently delete one trashed page from the Trash view. */
export function TrashActions({ accountId, page }: Readonly<{ accountId: string; page: { id: string; title: string; slug: string; revision: string } }>) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  // Keep the exact request across a lost response so a retry cannot double-apply.
  const pending = useRef<PageWrite | null>(null)

  async function run(request: PageWrite) {
    if (busy) return
    pending.current = request
    setBusy(true); setMessage('')
    try {
      const result = await writePage(request, accountId)
      if (result.error) { setMessage(result.error.message); if (result.error.code !== 'PAGE_UNAVAILABLE') pending.current = null; return }
      pending.current = null
      router.refresh()
    } catch { setMessage('The result could not be confirmed. Try again to retry the same request.') }
    finally { setBusy(false) }
  }
  function restore() {
    const retry = pending.current?.operation === 'recover' ? pending.current : null
    void run(retry ?? { operation: 'recover', requestKey: crypto.randomUUID(), pageId: page.id, expectedRevision: page.revision })
  }
  function remove() {
    const retry = pending.current?.operation === 'purge' ? pending.current : null
    if (retry) { void run(retry); return }
    const typed = window.prompt(`Permanently delete "${page.title}"? Its content and revision history are erased and cannot be recovered. Its URLs stay reserved. Type the URL slug ${page.slug} to confirm.`)
    if (typed === null) return
    if (typed.trim() !== page.slug) { setMessage('The slug did not match. Nothing was deleted.'); return }
    void run({ operation: 'purge', requestKey: crypto.randomUUID(), pageId: page.id, expectedRevision: page.revision, confirmSlug: page.slug })
  }
  return <div className="flex flex-wrap items-center gap-2">
    <Button size="sm" variant="outline" disabled={busy} onClick={restore}>Restore<span className="sr-only"> {page.title}</span></Button>
    <Button size="sm" variant="destructive" disabled={busy} onClick={remove}>Delete permanently<span className="sr-only"> {page.title}</span></Button>
    {message && <p role="alert" className="basis-full text-sm">{message}</p>}
  </div>
}

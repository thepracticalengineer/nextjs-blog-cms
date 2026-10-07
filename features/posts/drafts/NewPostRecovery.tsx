'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { readRecovery } from './storage'

type Entry = { document_id: string; title: string; updated_at: string }
export function NewPostRecovery({ userId, documentId, serverCopies }: { userId: string; documentId: string; serverCopies: Entry[] }) {
  const [copies, setCopies] = useState(serverCopies.filter(copy => copy.document_id !== documentId))
  useEffect(() => {
    try {
      const entries = new Map(serverCopies.filter(copy => copy.document_id !== documentId).map(copy => [copy.document_id, copy]))
      for (const { record } of readRecovery(userId)) {
        if (!record.postId && record.documentId !== documentId && !entries.has(record.documentId)) {
          entries.set(record.documentId, { document_id: record.documentId, title: record.values.title, updated_at: new Date(record.savedAt).toISOString() })
        }
      }
      // Local storage is an external source, read only after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCopies([...entries.values()])
    } catch { /* The editor reports storage failure and retains navigation protection. */ }
  }, [userId, documentId, serverCopies])
  if (!copies.length) return null
  return <section aria-label="Unfinished new posts" className="mb-6 rounded-lg border p-4 text-sm space-y-2">
    <h2 className="font-semibold">Unfinished new posts</h2>
    <p>Continue a separate draft, or write a new post below.</p>
    <ul className="space-y-2">{copies.map(copy => <li key={copy.document_id}><Link className="underline" href={`/dashboard/posts/new?draft=${encodeURIComponent(copy.document_id)}`}>Continue {copy.title || 'Untitled post'}</Link></li>)}</ul>
  </section>
}

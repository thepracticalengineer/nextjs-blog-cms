'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getPageRevision, listPageRevisions } from '@/features/pages/actions'
import { PageContent } from '../PageContent'
import { compareRevision, revisionOperationLabels } from '../revisions'
import type { Page, PageRevision, PageRevisionSummary } from '../schema'
import { pageValues } from './recovery'

const fieldLabels = { title: 'Title', slug: 'URL slug', seo_title: 'SEO title', seo_description: 'SEO description' } as const

/**
 * Private history for one page. Loads only while open, so closed panels cost no
 * queries. Restore is delegated to the manager, which owns request identity,
 * browser recovery and optimistic concurrency.
 */
export function RevisionHistory({ page, disabled, onRestore }: Readonly<{ page: Page; disabled: boolean; onRestore: (revision: PageRevision) => void }>) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<PageRevisionSummary[] | null>(null)
  const [selected, setSelected] = useState<PageRevision | null>(null)
  const [preview, setPreview] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const request = useRef(0)

  const load = useCallback(async () => {
    const ticket = ++request.current
    setLoading(true); setMessage('')
    try {
      const result = await listPageRevisions(page.id)
      if (ticket !== request.current) return
      if (result.error) { setMessage(result.error.message); return }
      setItems(result.data)
    } catch { if (ticket === request.current) setMessage('Revision history could not be loaded. Try again.') }
    finally { if (ticket === request.current) setLoading(false) }
  }, [page.id])

  // Refresh after every successful write while open; the newest row is the current revision.
  useEffect(() => {
    if (!open) return
    const refresh = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(refresh)
  }, [open, load, page.revision])

  async function select(item: PageRevisionSummary) {
    setPreview(false); setMessage('')
    try {
      const result = await getPageRevision(page.id, item.revision)
      if (result.error) { setMessage(result.error.message); return }
      if (!result.data) { setMessage('That revision no longer exists.'); return }
      setSelected(result.data)
    } catch { setMessage('The revision could not be loaded. Try again.') }
  }

  const current = selected?.revision === page.revision
  const comparison = selected ? compareRevision(pageValues(page), pageValues({ ...page, ...selected })) : null
  return <details className="rounded-lg border p-4" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">Revision history</summary>
    <div className="mt-3 flex min-w-0 flex-col gap-3">
      <p className="text-sm text-muted-foreground">Every save, publication change and restore is kept privately. Restoring copies a revision into the working draft; the live page changes only after you review and publish.</p>
      {loading && !items && <output>Loading revisions…</output>}
      {message && <p role="alert">{message}</p>}
      {items && items.length === 0 && <p>No revisions recorded yet.</p>}
      {items && items.length > 0 && <ol className="flex flex-col gap-1" aria-label="Revisions, newest first">
        {items.map(item => <li key={item.id}>
          <Button variant={selected?.revision === item.revision ? 'secondary' : 'ghost'} className="h-auto w-full min-w-0 justify-start whitespace-normal text-left" aria-current={selected?.revision === item.revision ? 'true' : undefined} onClick={() => void select(item)}>
            <span className="min-w-0 break-words">
              <strong>{revisionOperationLabels[item.operation]}</strong>
              {' · '}{new Date(item.created_at).toLocaleString()}
              {' · '}{item.author_name || (item.created_by ? 'Unnamed administrator' : 'Deleted account')}
              {item.revision === page.revision && ' · current draft'}
              <span className="block text-xs text-muted-foreground">{item.title} · /{item.slug} · {item.status}</span>
            </span>
          </Button>
        </li>)}
      </ol>}
      {items && items.length >= 50 && <p className="text-sm text-muted-foreground">Showing the 50 most recent revisions.</p>}
      {selected && comparison && <section aria-label="Selected revision" className="flex min-w-0 flex-col gap-3 rounded-md border p-3">
        <h3 className="font-semibold">{revisionOperationLabels[selected.operation]} · {new Date(selected.created_at).toLocaleString()}</h3>
        {current ? <p>This is the current saved draft.</p> : <>
          <p className="text-sm">Changes if restored, compared with the current saved draft:</p>
          {comparison.fields.length === 0 && !comparison.contentChanged && <p>No differences in content or settings.</p>}
          {comparison.fields.length > 0 && <dl className="grid gap-2 text-sm">{comparison.fields.map(change => <div key={change.field} className="min-w-0">
            <dt className="font-medium">{fieldLabels[change.field]}</dt>
            <dd className="break-words"><del className="text-destructive">{change.before || '(empty)'}</del>{' → '}<ins className="no-underline">{change.after || '(empty)'}</ins></dd>
          </div>)}</dl>}
          {comparison.layoutOnly && <p className="text-sm">Text is unchanged; layout, formatting or block settings differ.</p>}
          {comparison.contentChanged && !comparison.layoutOnly && <ul className="flex flex-col gap-1 text-sm" aria-label="Content changes">
            {comparison.lines.filter(line => line.kind !== 'same').map((line, index) => <li key={index} className="break-words">
              {line.kind === 'added' ? <ins className="no-underline">+ {line.text}</ins> : <del className="text-destructive">− {line.text}</del>}
            </li>)}
          </ul>}
        </>}
        {selected.slug !== (page.published_slug ?? selected.slug) && !current && <p className="text-sm">Publishing this revision later would change the live URL and needs separate confirmation.</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPreview(value => !value)}>{preview ? 'Close revision preview' : 'Preview revision'}</Button>
          {!current && <Button disabled={disabled} onClick={() => onRestore(selected)}>Restore as working draft</Button>}
        </div>
        {disabled && !current && <p className="text-sm text-muted-foreground">Save your changes or wait for the current request before restoring.</p>}
        {preview && <div className="min-w-0 rounded-md border p-3"><h1 className="mb-4 break-words text-3xl">{selected.title}</h1><PageContent document={selected.document} /></div>}
      </section>}
    </div>
  </details>
}

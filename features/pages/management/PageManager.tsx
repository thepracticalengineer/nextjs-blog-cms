'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/features/auth/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageEditor } from '../editor/PageEditor'
import { PageContent } from '../PageContent'
import { getPage, writePage } from '@/features/pages/actions'
import { pageValuesSchema, type Page, type PageValues, type PageWrite } from '../schema'
import { pageReadiness } from '../readiness'
import { installNavigationGuard } from '@/features/posts/drafts/navigation'
import { blankPage, pageValues, readPageRecovery, recoveryKey, storePageRecovery, type PageRecovery } from './recovery'

export function PageManager({ accountId, documentId, initialPage }: { accountId: string; documentId: string; initialPage: Page | null }) {
  const router = useRouter()
  const auth = useAuth()
  const accountActive = !auth.loading && auth.user?.id === accountId
  const [reconcile, setReconcile] = useState(false)
  const reconciliation = useRef(false)
  const [page, setPage] = useState(initialPage)
  const [values, setValues] = useState<PageValues>(() => initialPage ? pageValues(initialPage) : blankPage)
  const [copies, setCopies] = useState<PageRecovery[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PageWrite | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [preview, setPreview] = useState(false)
  const [message, setMessage] = useState('')
  const [storageError, setStorageError] = useState('')
  const [editorKey, setEditorKey] = useState(0)
  const writer = useRef('')
  const running = useRef(false)
  const recoveredKey = useRef<string | null>(null)
  const current = useRef({ values, page, pending, dirty: false })
  const dirty = JSON.stringify(values) !== JSON.stringify(page ? pageValues(page) : blankPage)
  const unsafe = useRef(false)
  useEffect(() => { current.current = { values, page, pending, dirty }; unsafe.current = dirty || !!pending || busy }, [values, page, pending, dirty, busy])
  useEffect(() => {
    writer.current = crypto.randomUUID()
    const initialize = window.setTimeout(() => {
      try { setCopies(readPageRecovery(accountId, documentId)) } catch { setStorageError('Browser recovery is unavailable. Keep this tab open until your page is saved.') }
      setReady(true)
    }, 0)
    const unload = (event: BeforeUnloadEvent) => { if (unsafe.current) { event.preventDefault(); event.returnValue = '' } }
    const guard = installNavigationGuard(() => !unsafe.current || window.confirm('Leave this page? Unsaved work is only recoverable in this browser when recovery is available.'), () => unsafe.current)
    window.addEventListener('beforeunload', unload)
    const interval = window.setInterval(guard.sync, 500)
    return () => { window.clearTimeout(initialize); window.clearInterval(interval); guard.dispose(); window.removeEventListener('beforeunload', unload) }
  }, [accountId, documentId])

  function persist(nextValues: PageValues, nextPage: Page | null, request: PageWrite | null) {
    try {
      storePageRecovery({ accountId, documentId, writerId: writer.current, values: nextValues, page: nextPage, pending: request, reconcile: reconciliation.current })
      setStorageError('')
      return true
    } catch { setStorageError('Browser recovery could not be written. Free browser storage and retry; keep this tab open.'); return false }
  }
  function change(next: PageValues) {
    current.current.values = next
    unsafe.current = true
    setValues(next); setReviewed(false); setMessage('')
    persist(next, current.current.page, current.current.pending)
  }
  function recover(copy: PageRecovery) {
    // Existing route must never adopt recovery from another page.
    if (initialPage && copy.page?.id !== initialPage.id) { setMessage('This recovery belongs to a different page. Open it from the Pages list.'); return }
    reconciliation.current = copy.reconcile
    setReconcile(copy.reconcile)
    recoveredKey.current = recoveryKey(copy)
    setValues(copy.values); setPage(copy.page); setPending(copy.pending); setReviewed(false)
    current.current = { values: copy.values, page: copy.page, pending: copy.pending, dirty: true }
    persist(copy.values, copy.page, copy.pending)
    setCopies([]); setEditorKey(key => key + 1)
    setMessage(copy.pending ? 'An earlier request needs confirmation. Retry it before making another save.' : 'Recovered private work. Review it before saving.')
  }
  async function send(request: PageWrite) {
    if (running.current || !accountActive) return
    // Durable exact request identity before dispatch prevents duplicate creates after reload.
    if (!persist(current.current.values, current.current.page, request)) return
    running.current = true; setBusy(true); setPending(request); current.current.pending = request
    setMessage('')
    try {
      const result = await writePage(request, accountId)
      if (result.error) {
        setMessage(result.error.message)
        // Unknown outcomes retain the exact request. Deterministic failures allow correction.
        if (['PAGE_INVALID_INPUT', 'PAGE_INVALID_DOCUMENT', 'PAGE_STALE', 'PAGE_RETRY_CONFLICT', 'PAGE_SLUG_CONFLICT', 'PAGE_NOT_READY', 'PAGE_REVIEW_REQUIRED', 'PAGE_NOT_FOUND'].includes(result.error.code)) {
          setPending(null); current.current.pending = null; persist(current.current.values, current.current.page, null)
        }
        return
      }
      const saved = result.data.page
      if (result.data.replayed && (!('values' in request) || JSON.stringify(pageValues(saved)) !== JSON.stringify(request.values))) {
        reconciliation.current = true
        setReconcile(true)
      }
      setPage(saved); current.current.page = saved
      setPending(null); current.current.pending = null; setReviewed(false)
      // Never replace input: a replay may return a newer revision from another editor.
      const retained = persist(current.current.values, saved, null)
      if (retained && recoveredKey.current) { localStorage.removeItem(recoveredKey.current); recoveredKey.current = null }
      setMessage(result.data.replayed ? 'Request confirmed. Your input is preserved; compare it with the latest saved page before saving again.' : request.operation === 'publish' ? 'Published snapshot updated. Public routing is pending #289.' : request.operation === 'unpublish' ? 'Page unpublished. Your working content is preserved.' : 'Draft saved. Published content is unchanged.')
    } catch { setMessage('The result could not be confirmed. Retry the same request; your input is preserved.') }
    finally { running.current = false; setBusy(false) }
  }
  function save() {
    if (!pageValuesSchema.safeParse(values).success) { setMessage('Enter a title (up to 200 characters), a lowercase URL slug (up to 120), and valid SEO fields and blocks.'); return }
    void send(page ? { operation: 'save', requestKey: crypto.randomUUID(), pageId: page.id, expectedRevision: page.revision, values } : { operation: 'create', requestKey: crypto.randomUUID(), values })
  }
  async function loadLatest() {
    if (!page || running.current || !window.confirm('Load the latest saved page? Your current input remains in browser recovery.')) return
    if (!persist(current.current.values, current.current.page, current.current.pending)) return
    running.current = true; setBusy(true)
    try {
      const result = await getPage(page.id)
      if (result.error || !result.data) { setMessage(result.error?.message ?? 'Page not found.'); return }
      const latest = result.data
      // Rotate writer identity, retaining the earlier input for explicit recovery.
      writer.current = crypto.randomUUID()
      recoveredKey.current = null
      reconciliation.current = false
      setReconcile(false); setValues(pageValues(latest)); setPage(latest); setPending(null); setReviewed(false); setEditorKey(key => key + 1)
      current.current = { values: pageValues(latest), page: latest, pending: null, dirty: false }
      setMessage('Latest saved page loaded. Earlier input is available from browser recovery on the Pages list.')
    } catch { setMessage('Latest saved content could not be loaded. Your input is preserved; try again.') }
    finally { running.current = false; setBusy(false) }
  }
  async function duplicate() {
    if (running.current || !accountActive || !window.confirm('Duplicate current content into a separate unpublished draft with a new URL?')) return
    if (!pageValuesSchema.safeParse(values).success) { setMessage('Complete the title, URL and valid page content before duplicating.'); return }
    if (!persist(current.current.values, current.current.page, current.current.pending)) return
    const id = crypto.randomUUID()
    const copyValues = { ...values, title: `${Array.from(values.title).slice(0, 190).join('')} (copy)`, slug: `copy-${id}` }
    const request: PageWrite = { operation: 'create', requestKey: crypto.randomUUID(), values: copyValues }
    const copy = { accountId, documentId: id, writerId: crypto.randomUUID(), page: null as Page | null, pending: request as PageWrite | null, values: copyValues }
    try { storePageRecovery(copy) }
    catch { setStorageError('The duplicate could not be stored. Free browser storage and try again.'); return }
    running.current = true; setBusy(true)
    try {
      const result = await writePage(request, accountId)
      if (result.data) { copy.page = result.data.page; copy.pending = null; storePageRecovery(copy) }
    } catch { /* The durable request remains available for exact retry. */ }
    finally { running.current = false; setBusy(false) }
    router.push(`/dashboard/pages/new?draft=${id}`)
  }
  const issues = pageReadiness(values)
  const blocked = !ready || !accountActive || busy || !!pending || copies.length > 0
  if (auth.loading) return <p role="status">Verifying your account…</p>
  if (!accountActive) return <p role="alert">Your account changed. Sign in with the original account and reopen this page to recover your work.</p>
  return <div className="flex min-w-0 flex-col gap-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{page ? 'Edit Page' : 'Add Page'}</h1><Link className="underline" href="/dashboard/pages">All pages</Link></header>
    <p role="status">{busy ? 'Saving…' : pending ? 'Request awaiting confirmation' : dirty ? 'Unsaved changes' : page ? `Saved · ${page.status}` : 'New private draft'}</p>
    {storageError && <p role="alert">{storageError}</p>}{message && <p role="status">{message}</p>}
    {copies.length > 0 && <section className="flex flex-col gap-2 rounded-lg border p-4" aria-label="Recover page work"><h2 className="font-semibold">Private browser recovery available</h2>{copies.map(copy => <Button key={copy.writerId} variant="outline" onClick={() => recover(copy)}>Recover {copy.values.title || 'untitled page'} — {new Date(copy.updatedAt).toLocaleString()}</Button>)}{!copies.some(copy => copy.pending) && <Button variant="ghost" onClick={() => setCopies([])}>Continue with saved content</Button>}</section>}
    {reconcile && <p role="alert">This retry returned a newer saved revision. Load the latest saved page before another save; your earlier input remains recoverable.</p>}
    {pending && <Button disabled={busy} onClick={() => void send(pending)}>Retry previous request</Button>}
    <fieldset inert={blocked} disabled={blocked} className="flex min-w-0 flex-col gap-4">
      <legend className="sr-only">Page details and content</legend>
      <div className="grid gap-4 md:grid-cols-2">{(['title', 'slug', 'seo_title', 'seo_description'] as const).map(field => <label className="flex min-w-0 flex-col gap-1" key={field}>{({ title: 'Title', slug: 'URL slug', seo_title: 'SEO title (optional)', seo_description: 'SEO description (optional)' })[field]}<Input value={values[field]} onChange={event => change({ ...values, [field]: event.target.value })} /></label>)}</div>
      <p className="text-sm text-muted-foreground">Planned URL: /{values.slug || 'your-page'} · Public routing and View Page are pending #289. Empty SEO titles use the page title; empty descriptions are omitted.</p>
      <PageEditor key={editorKey} editorId={accountId} document={values.document} onChange={document => change({ ...current.current.values, document })} />
    </fieldset>
    <div className="flex flex-wrap gap-2"><Button disabled={blocked || reconcile} onClick={save}>Save Draft</Button><Button variant="outline" disabled={!ready} onClick={() => setPreview(value => !value)}>{preview ? 'Close private preview' : 'Private Preview'}</Button><Button variant="outline" disabled={blocked} onClick={() => void duplicate()}>Duplicate</Button>{page && <Button variant="outline" disabled={busy || !!pending} onClick={() => void loadLatest()}>Load latest saved page</Button>}</div>
    {preview && <section aria-label="Private page preview" className="min-w-0 rounded-lg border p-4"><h2 className="font-semibold">Private preview · current unsaved content</h2><h1 className="my-4 break-words text-3xl">{values.title}</h1><PageContent document={values.document} /></section>}
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-label="Publication"><h2 className="font-semibold">Publication</h2><p>Save Draft preserves the published snapshot. Pages never send newsletters.</p>{issues.length > 0 && <ul className="list-inside list-disc">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}{dirty && <p>Save your changes before reviewing this revision for publication.</p>}
      <label className="flex items-start gap-2"><input type="checkbox" checked={reviewed} disabled={blocked || reconcile || dirty || !page || issues.length > 0} onChange={event => setReviewed(event.target.checked)} />I personally reviewed this saved revision, its links, images and SEO for publication.</label>
      <div className="flex flex-wrap gap-2"><Button disabled={blocked || reconcile || dirty || !page || !reviewed || issues.length > 0} onClick={() => page && void send({ operation: 'publish', requestKey: crypto.randomUUID(), pageId: page.id, expectedRevision: page.revision, reviewed: true })}>{page?.status === 'published' ? 'Update published page' : 'Publish'}</Button>{page?.status === 'published' && <Button variant="destructive" disabled={blocked} onClick={() => { if (window.confirm('Unpublish this page? Its working content will be kept.')) void send({ operation: 'unpublish', requestKey: crypto.randomUUID(), pageId: page.id, expectedRevision: page.revision }) }}>Unpublish</Button>}</div>
    </section>
  </div>
}

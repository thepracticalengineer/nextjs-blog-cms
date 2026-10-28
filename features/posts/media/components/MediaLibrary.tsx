'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Grid2X2, List, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { mediaContextUrl, type MediaContext } from '../context'
import type { MediaAsset } from '../library-types'
import { assetName, assetSize, mediaMutation, mediaRequest } from '../library-client'
import { MediaSessionBoundary } from './MediaSessionBoundary'
import { MediaDetails } from './MediaDetails'

type Page = { assets: MediaAsset[]; total: number; page: number; pageSize: number }
const selectClass = 'h-9 min-w-0 rounded-md border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring'
type LibraryProps = Readonly<{ editorId: string; context?: MediaContext; onSelect?: (asset: MediaAsset) => void; onSelecting?: (busy: boolean) => void; refresh?: number }>
export function MediaLibrary(props: LibraryProps) {
  return <MediaSessionBoundary editorId={props.editorId}><LibraryContent {...props} /></MediaSessionBoundary>
}
function LibraryContent({ editorId, onSelect, onSelecting, refresh = 0, context = 'post' }: LibraryProps) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [filter, setFilter] = useState('active')
  const [page, setPage] = useState(1)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; data?: Page; error?: string }>()
  const [selected, setSelected] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [selectionError, setSelectionError] = useState('')
  const selecting = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onSelecting?.(false) } }, [onSelecting])
  const params = new URLSearchParams({ editorId, q: search, sort, filter: onSelect ? 'active' : filter, page: String(page) })
  const url = mediaContextUrl(`/api/post-media/library?${params}`, context)
  const key = `${url}:${revision}:${refresh}`
  useEffect(() => {
    const controller = new AbortController()
    mediaRequest<Page>(url, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ key, data })
    }).catch(error => { if (!controller.signal.aborted) setResult({ key, error: error.message }) })
    return () => controller.abort()
  }, [key, url])
  const current = result?.key === key ? result : undefined
  const data = current?.data
  async function choose(asset: MediaAsset) {
    if (!onSelect) { setSelected(asset.id); return }
    if (selecting.current) return
    selecting.current = true
    setBusy(true)
    onSelecting?.(true)
    setSelectionError('')
    try {
      const { asset: pinned } = await mediaMutation(asset.id, editorId, {}, true, undefined, context)
      if (!pinned?.id || !pinned.url) throw new Error('Image selection failed. Refresh the library and retry.')
      if (mounted.current) onSelect(pinned)
    } catch (error) { if (mounted.current) setSelectionError((error as Error).message) }
    finally { selecting.current = false; if (mounted.current) { setBusy(false); onSelecting?.(false) } }
  }
  return <section aria-label="Media library" className="flex min-w-0 flex-col gap-4">
    <p className="text-xs text-muted-foreground">Unused editor uploads may expire after seven days. Open image details, select or edit an image to keep it.</p>
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(query.trim()); setRevision(value => value + 1) }}>
      <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1"><Label htmlFor={`${id}-search`}>Search your images</Label><Input id={`${id}-search`} value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="Title or filename…" /></div>
      <Button type="submit" variant="outline" aria-label="Search media"><Search data-icon="inline-start" />Search</Button>
      <div className="flex flex-col gap-1"><Label htmlFor={`${id}-sort`}>Sort</Label><select id={`${id}-sort`} className={selectClass} value={sort} onChange={event => { setSort(event.target.value); setPage(1) }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option></select></div>
      {!onSelect && <div className="flex flex-col gap-1"><Label htmlFor={`${id}-filter`}>Show</Label><select id={`${id}-filter`} className={selectClass} value={filter} onChange={event => { setFilter(event.target.value); setPage(1) }}><option value="active">Active images</option><option value="archived">Archived images</option></select></div>}
    </form>
    <div className="flex items-center justify-between gap-2"><output className="text-sm text-muted-foreground">{libraryStatus(data, !!search, current?.error)}</output>
      <fieldset aria-label="Library view" className="flex gap-1"><Button type="button" size="icon-sm" variant="outline" aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid2X2 /></Button><Button type="button" size="icon-sm" variant="outline" aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List /></Button></fieldset>
    </div>
    {current?.error && <div className="flex flex-col gap-2"><p role="alert">{current.error}</p><Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)}>Retry loading media</Button></div>}
    {!current && <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[0, 1, 2].map(item => <Skeleton key={item} className="aspect-square rounded-xl" />)}</div>}
    {data?.assets.length === 0 && <EmptyLibrary searching={!!search} archived={filter === 'archived'} />}
    {data && <ul className={cn(view === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4' : 'flex flex-col gap-2')}>
      {data.assets.map(asset => <li key={asset.id} className="min-w-0"><button type="button" disabled={busy} aria-label={`${onSelect ? 'Select' : 'Open'} ${assetName(asset)}`} onClick={() => void choose(asset)} className={cn('group w-full min-w-0 overflow-hidden rounded-xl border bg-background text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50', view === 'list' && 'flex items-center gap-3')}>
        {/* Public immutable URLs; native previews also support local storage fixtures. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.url} alt="" loading="lazy" className={cn('bg-muted/50 object-contain', view === 'grid' ? 'aspect-[4/3] w-full p-2' : 'size-20 shrink-0 p-1')} />
        <div className="min-w-0 p-3"><p className="truncate text-sm font-medium" title={assetName(asset)}>{assetName(asset)}</p><p className="mt-1 text-xs text-muted-foreground">{asset.width && asset.height ? `${asset.width} × ${asset.height} · ` : ''}{assetSize(asset.byte_size)}</p></div>
      </button></li>)}
    </ul>}
    {selectionError && <p role="alert">{selectionError}</p>}
    {busy && <output>Preparing image…</output>}
    {data && data.total > 0 && <nav aria-label="Media pagination" className="flex flex-wrap items-center justify-between gap-2"><Button type="button" variant="outline" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>Previous</Button><span className="text-sm">Page {data.page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><Button type="button" variant="outline" disabled={data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}>Next</Button></nav>}
    {selected && <MediaDetails context={context} key={selected} id={selected} editorId={editorId} onClose={() => setSelected(undefined)} onChanged={() => setRevision(value => value + 1)} />}
  </section>
}

function libraryStatus(data: Page | undefined, searching: boolean, error?: string) {
  if (data) return `${data.total} image${data.total === 1 ? '' : 's'}${searching ? ' matching' : ''}`
  return error ? 'Unable to load images' : 'Loading images…'
}
function EmptyLibrary({ searching, archived }: Readonly<{ searching: boolean; archived: boolean }>) {
  let title = 'Your library is ready for its first image'
  let description = 'Upload an image to keep it handy for your next article.'
  if (searching) { title = 'No matching images'; description = 'Try another title or filename.' }
  else if (archived) { title = 'No archived images'; description = 'Images you archive appear here and can be restored.' }
  return <div className="rounded-xl border border-dashed p-8 text-center"><p className="font-medium">{title}</p><p className="mt-2 text-sm text-muted-foreground">{description}</p></div>
}

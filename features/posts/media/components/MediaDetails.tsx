'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { mediaContextUrl, type MediaContext } from '../context'
import type { MediaAsset } from '../library-types'
import { assetName, assetSize, mediaMutation, mediaRequest } from '../library-client'

type Metadata = Pick<MediaAsset, 'title' | 'alt_text' | 'caption' | 'description'>
export function MediaDetails({ id, editorId, onClose, onChanged, context = 'post' }: Readonly<{ id: string; editorId: string; context?: MediaContext; onClose: () => void; onChanged: (asset: MediaAsset) => void }>) {
  const formId = useId()
  const [asset, setAsset] = useState<MediaAsset>()
  const [values, setValues] = useState<Metadata>()
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [revision, setRevision] = useState(0)
  const pending = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    mediaRequest<{ asset: MediaAsset }>(mediaContextUrl(`/api/post-media/library/${encodeURIComponent(id)}?${new URLSearchParams({ editorId })}`, context), { signal: controller.signal }).then(async ({ asset: loaded }) => {
      if (controller.signal.aborted) return
      // Make the URL safe to copy, including manual copying from the read-only field.
      // Archived assets already have durable retention and must not be selected.
      const asset = loaded.archived_at ? loaded : (await mediaMutation(id, editorId, {}, true, controller.signal, context)).asset
      if (!controller.signal.aborted) { setAsset(asset); setValues({ title: asset.title, alt_text: asset.alt_text, caption: asset.caption, description: asset.description }); setError('') }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [id, editorId, revision, context])
  const dirty = !!asset && !!values && Object.entries(values).some(([key, value]) => asset[key as keyof Metadata] !== value)
  function close() {
    if (pending.current) return
    if (dirty) setConfirmClose(true)
    else onClose()
  }
  async function save(archive?: boolean) {
    if (pending.current || !values) return
    pending.current = true
    setBusy(true); setError(''); setStatus('')
    try {
      const { asset: updated } = await mediaMutation(id, editorId, archive === undefined ? values : { archived: archive }, false, undefined, context)
      setAsset(updated)
      if (archive === undefined) { setValues({ title: updated.title, alt_text: updated.alt_text, caption: updated.caption, description: updated.description }); setStatus('Metadata saved. Existing articles are unchanged.') }
      else { setConfirmArchive(false); setStatus(archive ? 'Image archived. Existing URLs still work.' : 'Image restored to your library.') }
      onChanged(updated)
    } catch (error) { setError((error as Error).message) }
    finally { pending.current = false; setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open) close() }}><DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
    <DialogHeader className="pr-6"><DialogTitle>Image details</DialogTitle><DialogDescription>Edit defaults for future insertions. Existing article descriptions remain unchanged.</DialogDescription></DialogHeader>
    <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto">
      {asset && values ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.url} alt={asset.alt_text || assetName(asset)} className="max-h-60 w-full rounded-lg bg-muted/50 object-contain" />
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm"><dt className="text-muted-foreground">Original filename</dt><dd className="break-all">{asset.original_filename || 'Unknown (legacy upload)'}</dd><dt className="text-muted-foreground">Stored format</dt><dd>WebP</dd><dt className="text-muted-foreground">Dimensions</dt><dd>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : 'Unknown'}</dd><dt className="text-muted-foreground">File size</dt><dd>{assetSize(asset.byte_size)}</dd><dt className="text-muted-foreground">Uploaded</dt><dd>{asset.uploaded_at ? new Date(asset.uploaded_at).toLocaleString() : 'Unknown (legacy upload)'}</dd></dl>
        <div className="flex flex-col gap-2"><Label htmlFor={`${formId}-url`}>Public image URL</Label><Input id={`${formId}-url`} readOnly value={asset.url} /><Button type="button" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(asset.url); setStatus('URL copied.') } catch { setError('Unable to copy automatically. Select and copy the URL above.') } }}>Copy URL</Button></div>
        <form id={formId} className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); void save() }}>
          {(['title', 'alt_text', 'caption', 'description'] as const).map(key => <div key={key} className="flex flex-col gap-1"><Label htmlFor={`${formId}-${key}`}>{({ title: 'Title', alt_text: 'Default alt text', caption: 'Caption', description: 'Description' })[key]}</Label>{key === 'title' || key === 'alt_text' ? <Input id={`${formId}-${key}`} value={values[key]} maxLength={key === 'title' ? 255 : 1000} disabled={busy} onChange={event => setValues({ ...values, [key]: event.target.value })} /> : <Textarea id={`${formId}-${key}`} value={values[key]} maxLength={key === 'caption' ? 2000 : 5000} disabled={busy} onChange={event => setValues({ ...values, [key]: event.target.value })} />}</div>)}
          <p className="text-xs text-muted-foreground">Captions and descriptions stay in your library. Only default alt text is copied when inserting an image.</p>
        </form>
        <Button type="button" variant="outline" disabled={busy || dirty} onClick={() => asset.archived_at ? void save(false) : setConfirmArchive(true)}>{asset.archived_at ? 'Restore image' : 'Archive image'}</Button>
        {dirty && <p className="text-xs text-muted-foreground">Save or discard metadata changes before archiving or restoring.</p>}
      </> : !error && <output>Loading image details…</output>}
      {error && <div><p role="alert">{error}</p>{!asset && <Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)}>Retry details</Button>}</div>}
      {status && <output>{status}</output>}
    </div>
    <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={close}>Close details</Button><Button type="submit" form={formId} disabled={busy || !values || !dirty}>{busy ? 'Saving…' : 'Save metadata'}</Button></DialogFooter>
    <Dialog open={confirmClose} onOpenChange={setConfirmClose}><DialogContent><DialogHeader><DialogTitle>Discard metadata changes?</DialogTitle><DialogDescription>Your unsaved image details will be lost.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" onClick={() => setConfirmClose(false)}>Keep editing</Button><Button type="button" variant="destructive" onClick={onClose}>Discard changes</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={confirmArchive} onOpenChange={open => { if (!busy) setConfirmArchive(open) }}><DialogContent><DialogHeader><DialogTitle>Archive image?</DialogTitle><DialogDescription>This hides the image from your active library. Existing articles and public URLs keep working. You can restore it from Archived images.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmArchive(false)}>Cancel</Button><Button type="button" disabled={busy} onClick={() => void save(true)}>Confirm archive</Button></DialogFooter></DialogContent></Dialog>
  </DialogContent></Dialog>
}

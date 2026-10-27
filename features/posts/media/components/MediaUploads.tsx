'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { IMAGE_ACCEPT, imageFileError } from '../validation'
import { uploadImage } from '../client'
import { MediaDetails } from './MediaDetails'

type Upload = { id: number; file: File; progress: number; state: 'uploading' | 'failed' | 'done'; error?: string; archived?: boolean; assetId?: string }
export function MediaUploads({ editorId, onUploaded }: Readonly<{ editorId: string; onUploaded: () => void }>) {
  const inputId = useId()
  const [detailsId, setDetailsId] = useState<string>()
  const [batchError, setBatchError] = useState('')
  const mounted = useRef(true)
  const [uploads, setUploads] = useState<Upload[]>([])
  const requests = useRef(new Map<number, AbortController>())
  const nextId = useRef(0)
  useEffect(() => { mounted.current = true; const active = requests.current; return () => { mounted.current = false; for (const request of active.values()) request.abort() } }, [])
  function update(id: number, values: Partial<Upload>) { setUploads(previous => previous.map(item => item.id === id ? { ...item, ...values } : item)) }
  async function upload(item: Upload) {
    if (!mounted.current || requests.current.has(item.id)) return
    const error = imageFileError(item.file)
    if (error) { update(item.id, { state: 'failed', error }); return }
    const controller = new AbortController()
    requests.current.set(item.id, controller)
    update(item.id, { state: 'uploading', progress: 0, error: undefined })
    try {
      const result = await uploadImage(item.file, editorId, progress => update(item.id, { progress }), controller.signal, 'library')
      if (!controller.signal.aborted) { update(item.id, { state: 'done', progress: 100, archived: result.archived, assetId: result.assetId }); onUploaded() }
    } catch (error) {
      if (!controller.signal.aborted) update(item.id, { state: 'failed', error: (error as Error).message })
    } finally { requests.current.delete(item.id) }
  }
  return <section aria-label="Image uploads" className="flex min-w-0 flex-col gap-3 rounded-xl border border-dashed bg-muted/30 p-4">
    <div className="flex flex-col gap-1"><Label htmlFor={inputId}>Upload images</Label><p className="text-sm text-muted-foreground">JPEG, PNG or WebP · up to 4 MB each. Uploads made here stay stored, including when archived.</p></div>
    <Input id={inputId} type="file" accept={IMAGE_ACCEPT} multiple disabled={uploads.some(item => item.state === 'uploading')} onChange={event => {
      const files = Array.from(event.target.files ?? [])
      if (files.length > 20) { setBatchError('Choose up to 20 images per batch. No files from this batch were uploaded.'); event.target.value = ''; return }
      setBatchError('')
      const items: Upload[] = files.map(file => ({ id: nextId.current++, file, progress: 0, state: 'uploading' }))
      setUploads(previous => [...previous.filter(item => item.state !== 'done'), ...items])
      event.target.value = ''
      // Sequential transfers bound memory/request pressure and preserve per-file retry.
      void (async () => { for (const item of items) await upload(item) })()
    }} />
    <p className="text-xs text-muted-foreground">Choose up to 20 files per batch. Uploaded images are public to anyone with their URL.</p>
    {batchError && <p role="alert">{batchError}</p>}
    {uploads.length > 0 && <ul aria-live="polite" className="flex flex-col gap-3">{uploads.map(item => <li key={item.id} className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="break-all font-medium">{item.file.name}</span>
      <UploadStatus item={item} busy={uploads.some(other => other.state === 'uploading')} onRetry={() => void upload(item)} onOpen={() => setDetailsId(item.assetId)} />
    </li>)}</ul>}
    {detailsId && <MediaDetails id={detailsId} editorId={editorId} onClose={() => setDetailsId(undefined)} onChanged={asset => {
      setUploads(previous => previous.map(item => item.assetId === asset.id ? { ...item, archived: !!asset.archived_at } : item))
      onUploaded()
    }} />}
  </section>
}

function UploadStatus({ item, busy, onRetry, onOpen }: Readonly<{ item: Upload; busy: boolean; onRetry: () => void; onOpen: () => void }>) {
  if (item.state === 'uploading') return <>
    <progress aria-label={`Uploading ${item.file.name}`} max={100} value={item.progress} className="w-full" />
    <span>{item.progress === 100 ? 'Processing image…' : `${item.progress}%`}</span>
  </>
  if (item.state === 'failed') return <>
    <p role="alert">{item.error}</p>
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRetry}>Retry {item.file.name}</Button>
  </>
  if (item.archived) return <>
    <span>Already in your archive. Restore it to use it again.</span>
    {item.assetId && <Button type="button" variant="outline" size="sm" onClick={onOpen}>Open archived image {item.file.name}</Button>}
  </>
  return <span>Uploaded</span>
}

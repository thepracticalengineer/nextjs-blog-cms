'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { MediaContext } from '@/features/posts/media/context'
import { pastedImageFile } from '@/features/posts/media/clipboard'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MediaLibrary } from '@/features/posts/media/components/MediaLibrary'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { imageFileError, IMAGE_ACCEPT, type ImageValue } from '@/features/posts/media/validation'
import { readImageDimensions, uploadImage, validateImageUrl } from '@/features/posts/media/client'

export function ImageDialog({ editorId, initial, initialFile, onSave, onClose, cover = false, context = 'post' }: {
  editorId: string; initial?: ImageValue; initialFile?: File; cover?: boolean; context?: MediaContext
  onSave: (image: ImageValue) => void; onClose: () => void
}) {
  const id = useId()
  const [source, setSource] = useState('upload')
  const [file, setFile] = useState(initialFile)
  const [url, setUrl] = useState(initialFile ? '' : initial?.src ?? '')
  const [image, setImage] = useState<ImageValue | undefined>(initialFile ? undefined : initial)
  const initialAlt = initial?.alt ?? ''
  const [alt, setAlt] = useState(initialAlt)
  const initiallyDecorative = !cover && !!initial && !initialAlt.trim()
  const [decorative, setDecorative] = useState(initiallyDecorative)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [error, setError] = useState(initialFile ? imageFileError(initialFile) : undefined)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'upload' | 'validate' | 'select'>('upload')
  const [progress, setProgress] = useState(0)
  const request = useRef<AbortController | null>(null)
  const inFlight = useRef(false)
  useEffect(() => () => request.current?.abort(), [])

  const selecting = useCallback((pending: boolean) => {
    inFlight.current = pending
    setBusy(pending)
    if (pending) setPhase('select')
  }, [])

  const dirty = !!file || url !== (initial?.src ?? '') || alt !== initialAlt || decorative !== initiallyDecorative
  function close() {
    if (dirty || inFlight.current) {
      // A pending save must never apply behind the discard confirmation.
      // Uploads may continue while deciding, but URL validation can be retried.
      if (inFlight.current && phase === 'validate') {
        request.current?.abort()
        inFlight.current = false
        setBusy(false)
      }
      setConfirmDiscard(true)
    } else onClose()
  }
  function discard() {
    request.current?.abort()
    onClose()
  }

  function chooseFile(next: File) {
    setSource('upload')
    setFile(next)
    setImage(undefined)
    setUrl('')
    setError(imageFileError(next))
  }
  async function upload() {
    if (!file || inFlight.current) return
    inFlight.current = true
    setError(undefined)
    setBusy(true)
    setPhase('upload')
    setProgress(0)
    const controller = new AbortController()
    request.current = controller
    try {
      const result = await uploadImage(file, editorId, setProgress, controller.signal, 'editor', context)
      if (controller.signal.aborted) return
      setImage(result)
      setUrl(result.src)
    } catch (error) { if (!controller.signal.aborted) setError((error as Error).message) }
    finally { if (!controller.signal.aborted) { inFlight.current = false; setBusy(false) } }
  }
  async function save() {
    if (inFlight.current) return
    if (!decorative && !alt.trim()) { setError(cover ? 'Describe what the cover image communicates for readers who cannot see it.' : 'Describe what the image communicates, or mark an inline image as decorative.'); return }
    inFlight.current = true
    setError(undefined)
    setBusy(true)
    setPhase('validate')
    const controller = new AbortController()
    request.current = controller
    try {
      // Validate existing and manually entered URLs against the same cover allowlist.
      const src = await validateImageUrl(url.trim(), editorId, controller.signal, context)
      const dimensions = image?.src === src && image.width && image.height
        ? { width: image.width, height: image.height } : await readImageDimensions(src, controller.signal)
      if (controller.signal.aborted) return
      onSave({ ...(image?.src === src && image.assetId ? { assetId: image.assetId } : {}), src, alt: decorative ? '' : alt.trim(), ...dimensions })
      onClose()
    } catch (error) { if (!controller.signal.aborted) setError((error as Error).message) }
    finally { if (!controller.signal.aborted) { inFlight.current = false; setBusy(false) } }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) close() }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden sm:max-w-2xl" onPaste={event => {
        const pasted = pastedImageFile(event.clipboardData)
        if (pasted && !busy && !confirmDiscard) { event.preventDefault(); chooseFile(pasted) }
      }}>
        <DialogHeader className="min-w-0 pr-6 pb-4">
          <DialogTitle>{cover ? 'Cover image' : context === 'page' ? 'Page image' : 'Article image'}</DialogTitle>
          <DialogDescription>Choose or paste a JPEG, PNG or WebP up to 4 MB, or use a publicly accessible image URL. Uploaded images are public to anyone with their URL.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain py-1 [overflow-wrap:anywhere]">
          <Tabs value={source} onValueChange={value => setSource(String(value))}>
            <TabsList className="flex-wrap" aria-label="Image source">
              <TabsTrigger value="upload" disabled={busy}>Upload</TabsTrigger>
              <TabsTrigger value="library" disabled={busy}>Media Library</TabsTrigger>
              <TabsTrigger value="url" disabled={busy}>Insert from URL</TabsTrigger>
            </TabsList>
            <TabsContent value="library"><MediaLibrary context={context} editorId={editorId} onSelecting={selecting} onSelect={asset => {
              setFile(undefined); setUrl(asset.url); setAlt(asset.alt_text); setDecorative(false); setError(undefined)
              setImage({ assetId: asset.id, src: asset.url, alt: asset.alt_text, ...(asset.width && asset.height ? { width: asset.width, height: asset.height } : {}) })
              setSource('url')
            }} /></TabsContent>
            <TabsContent value="url"><p className="text-sm text-muted-foreground">Enter a public image URL below, then add a description.</p></TabsContent>
            <TabsContent value="upload">
          <div className="min-w-0 space-y-2">
            <Label htmlFor={`${id}-file`}>Image file</Label>
            <Input id={`${id}-file`} type="file" accept={IMAGE_ACCEPT} disabled={busy} onChange={event => {
              const next = event.target.files?.[0]
              if (next) chooseFile(next)
            }} />
            {file && <p className="text-sm [overflow-wrap:anywhere]" title={file.name}>Selected: {file.name || 'Pasted image'}</p>}
            <Button type="button" variant="outline" disabled={!file || busy || !!imageFileError(file)} onClick={() => void upload()}>{image && image.src === url ? 'Upload again' : 'Upload image / retry'}</Button>
            {busy && <div role="status" aria-live="polite">{phase === 'upload' && <progress aria-label="Image upload progress" value={progress} max={100} className="w-full" />}<p>{phase === 'validate' ? 'Checking image URL…' : progress === 100 ? 'Optimizing and storing image…' : progress ? `Uploading image: ${progress}%` : 'Preparing image…'}</p></div>}
            {image && <output className="block">{'reused' in image && image.reused ? 'This image has already been uploaded. Reusing the existing image' : 'Image ready'}{image.width && image.height ? ` (${image.width} × ${image.height})` : ''}. Add its description, then use the image.</output>}
          </div>
            </TabsContent>
          </Tabs>
          <div className="mt-4 min-w-0 space-y-2">
            <Label htmlFor={`${id}-url`}>Image URL</Label>
            <Input id={`${id}-url`} value={url} disabled={busy} placeholder="https://…" onChange={event => { setUrl(event.target.value); setImage(undefined); setError(undefined) }} />
            <p className="text-xs text-muted-foreground">URLs must use a configured HTTPS image host or a local image path. Upload a file if the host is unsupported.</p>
          </div>
          <div className="mt-4 min-w-0 space-y-2">
            <Label htmlFor={`${id}-alt`}>Image description (alt text)</Label>
            <Input id={`${id}-alt`} value={alt} maxLength={1000} disabled={busy || decorative} onChange={event => setAlt(event.target.value)} aria-describedby={`${id}-alt-help`} />
            <p id={`${id}-alt-help`} className="text-xs text-muted-foreground">Describe the relevant subject or information for readers who cannot see the image.</p>
            {!cover && <label className="flex gap-2 items-center"><input type="checkbox" checked={decorative} disabled={busy} onChange={event => setDecorative(event.target.checked)} />This image is decorative</label>}
          </div>
          {error && <p role="alert" className="text-destructive">{error} Your document input is preserved.</p>}
        </div>
        <DialogFooter className="mt-4 min-w-0">
          <Button type="button" variant="outline" onClick={close}>Cancel</Button>
          <Button type="button" disabled={busy || !url.trim()} onClick={() => void save()}>Use image</Button>
        </DialogFooter>
        <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Discard image changes?</DialogTitle>
              <DialogDescription>{busy
                ? 'This will cancel the browser request and discard your image input. The server may still finish uploading; you can reuse the image by uploading it again.'
                : 'Your file selection, image URL and description have not been applied to the document.'}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" autoFocus onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
              <Button type="button" variant="destructive" onClick={discard}>Discard changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}

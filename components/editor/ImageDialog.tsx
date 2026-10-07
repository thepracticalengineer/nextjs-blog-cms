'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { pastedImageFile } from '@/features/posts/media/clipboard'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { imageFileError, IMAGE_ACCEPT, type ImageValue } from '@/features/posts/media/validation'
import { readImageDimensions, uploadImage, validateImageUrl } from '@/features/posts/media/client'

export function ImageDialog({ editorId, initial, initialFile, onSave, onClose, cover = false }: {
  editorId: string; initial?: ImageValue; initialFile?: File; cover?: boolean
  onSave: (image: ImageValue) => void; onClose: () => void
}) {
  const id = useId()
  const [file, setFile] = useState(initialFile)
  const [url, setUrl] = useState(initialFile ? '' : initial?.src ?? '')
  const [image, setImage] = useState<ImageValue | undefined>(initialFile ? undefined : initial)
  const [alt, setAlt] = useState(initial?.alt ?? '')
  const [decorative, setDecorative] = useState(false)
  const [error, setError] = useState(initialFile ? imageFileError(initialFile) : undefined)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'upload' | 'validate'>('upload')
  const [progress, setProgress] = useState(0)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])

  function chooseFile(next: File) {
    setFile(next)
    setImage(undefined)
    setUrl('')
    setError(imageFileError(next))
  }
  async function upload() {
    if (!file || busy) return
    setError(undefined)
    setBusy(true)
    setPhase('upload')
    setProgress(0)
    const controller = new AbortController()
    request.current = controller
    try {
      const result = await uploadImage(file, editorId, setProgress, controller.signal)
      if (controller.signal.aborted) return
      setImage(result)
      setUrl(result.src)
    } catch (error) { if (!controller.signal.aborted) setError((error as Error).message) }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  async function save() {
    if (busy) return
    if (!decorative && !alt.trim()) { setError(cover ? 'Describe what the cover image communicates for readers who cannot see it.' : 'Describe what the image communicates, or mark an inline image as decorative.'); return }
    setError(undefined)
    setBusy(true)
    setPhase('validate')
    const controller = new AbortController()
    request.current = controller
    try {
      // Validate existing and manually entered URLs against the same cover allowlist.
      const src = await validateImageUrl(url.trim(), editorId, controller.signal)
      const dimensions = image?.src === src && image.width && image.height
        ? { width: image.width, height: image.height } : await readImageDimensions(src, controller.signal)
      if (controller.signal.aborted) return
      onSave({ src, alt: decorative ? '' : alt.trim(), ...dimensions })
      onClose()
    } catch (error) { if (!controller.signal.aborted) setError((error as Error).message) }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" onPaste={event => {
        const pasted = pastedImageFile(event.clipboardData)
        if (pasted && !busy) { event.preventDefault(); chooseFile(pasted) }
      }}>
        <DialogHeader>
          <DialogTitle>{cover ? 'Cover image' : 'Article image'}</DialogTitle>
          <DialogDescription>Choose or paste a JPEG, PNG or WebP up to 4 MB, or use a publicly accessible image URL. Uploaded images are public to anyone with their URL.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`${id}-file`}>Image file</Label>
          <Input id={`${id}-file`} type="file" accept={IMAGE_ACCEPT} disabled={busy} onChange={event => {
            const next = event.target.files?.[0]
            if (next) chooseFile(next)
          }} />
          {file && <p className="text-sm break-words">Selected: {file.name || 'Pasted image'}</p>}
          <Button type="button" variant="outline" disabled={!file || busy || !!imageFileError(file)} onClick={() => void upload()}>{image && image.src === url ? 'Upload again' : 'Upload image / retry'}</Button>
          {busy && <div role="status" aria-live="polite">{phase === 'upload' && <progress aria-label="Image upload progress" value={progress} max={100} className="w-full" />}<p>{phase === 'validate' ? 'Checking image URL…' : progress === 100 ? 'Optimizing and storing image…' : progress ? `Uploading image: ${progress}%` : 'Preparing image…'}</p></div>}
          {image && <p role="status">Image ready{image.width && image.height ? ` (${image.width} × ${image.height})` : ''}. Add its description, then use the image.</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-url`}>Image URL</Label>
          <Input id={`${id}-url`} value={url} disabled={busy} placeholder="https://…" onChange={event => { setUrl(event.target.value); setImage(undefined); setError(undefined) }} />
          <p className="text-xs text-muted-foreground">URLs must use a configured HTTPS image host or a local image path. Upload a file if the host is unsupported.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-alt`}>Image description (alt text)</Label>
          <Input id={`${id}-alt`} value={alt} maxLength={1000} disabled={busy || decorative} onChange={event => setAlt(event.target.value)} aria-describedby={`${id}-alt-help`} />
          <p id={`${id}-alt-help`} className="text-xs text-muted-foreground">Describe the relevant subject or information for readers who cannot see the image.</p>
          {!cover && <label className="flex gap-2 items-center"><input type="checkbox" checked={decorative} disabled={busy} onChange={event => setDecorative(event.target.checked)} />This image is decorative</label>}
        </div>
        {error && <p role="alert" className="text-destructive">{error} Your document input is preserved.</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={busy || !url.trim()} onClick={() => void save()}>Use image</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

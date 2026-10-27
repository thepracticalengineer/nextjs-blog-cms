'use client'

import { useId, useRef, useState, type RefObject } from 'react'
import { type Editor } from '@tiptap/react'
import { closeHistory } from '@tiptap/pm/history'
import { NodeSelection } from '@tiptap/pm/state'
import { parseVideoUrl, VIDEO_URL_ERROR } from '@/lib/editor-video'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function VideoDialog({ editor, triggerRef, onClose }: Readonly<{
  editor: Editor; triggerRef: RefObject<HTMLButtonElement | null>; onClose: () => void
}>) {
  const [original] = useState(() => {
    const selection = editor.state.selection
    const node = selection instanceof NodeSelection && ['youtube', 'video'].includes(selection.node.type.name) ? selection.node : null
    return { selection, doc: editor.state.doc, node }
  })
  const [url, setUrl] = useState<string>(original.node?.attrs.src ?? '')
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  function apply(remove = false) {
    if (editor.isDestroyed || !editor.state.doc.eq(original.doc)) { setError(''); setStale(true); return }
    const video = parseVideoUrl(url.trim())
    if (!remove && !video) { setError(VIDEO_URL_ERROR); inputRef.current?.focus(); return }
    const { from, to } = original.selection
    const chain = editor.chain().command(({ tr }) => { closeHistory(tr); return true })
    const applied = remove
      ? chain.deleteRange({ from, to }).run()
      : video && chain.insertContentAt({ from, to }, { type: video.type, attrs: { src: video.src } }).run()
    if (applied) onClose()
    else setError('The video could not be inserted here. Cancel and choose another location.')
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent initialFocus={inputRef} finalFocus={triggerRef} className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{original.node ? 'Edit video' : 'Insert video'}</DialogTitle>
        <DialogDescription id={`${id}-help`}>Use a YouTube watch or youtu.be link, or a direct HTTPS MP4 or WebM URL. Playback depends on the host and browser; some YouTube videos cannot be embedded.</DialogDescription>
      </DialogHeader>
      <Label htmlFor={id}>Video URL</Label>
      <Input id={id} ref={inputRef} value={url} inputMode="url" autoComplete="off" aria-invalid={!!error}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
        onChange={event => { setUrl(event.target.value); setError('') }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && !stale) { event.preventDefault(); apply() } }} />
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
      {stale && <p role="alert">The document changed. Cancel and select the video location again.</p>}
      <DialogFooter>
        {original.node && <Button type="button" variant="destructive" disabled={stale} onClick={() => apply(true)}>Remove video</Button>}
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={stale} onClick={() => apply()}>Apply</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

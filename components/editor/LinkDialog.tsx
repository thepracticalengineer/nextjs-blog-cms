'use client'

import { useId, useRef, useState, type RefObject } from 'react'
import { parseAllowedLinkUrl } from '@/lib/editor-link-url'
import type { Editor } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function LinkDialog({ editor, triggerRef, onClose }: Readonly<{
  editor: Editor
  triggerRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
}>) {
  // Capture once, before the dialog takes DOM focus. Dismissal never dispatches a transaction.
  const [original] = useState(() => ({ selection: editor.state.selection, doc: editor.state.doc, href: editor.getAttributes('link').href as string | undefined }))
  const [url, setUrl] = useState(original.href ?? '')
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  function apply() {
    const value = url.trim()
    if (stale) return
    const parsed = parseAllowedLinkUrl(value)
    const hasWhitespaceOrControl = [...value].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
    if (!parsed || (parsed.protocol === 'mailto:' && !parsed.pathname) || hasWhitespaceOrControl) {
      setError('Enter a valid http://, https://, or mailto: URL.')
      inputRef.current?.focus()
      return
    }
    if (editor.isDestroyed || !editor.state.doc.eq(original.doc)) {
      setError('')
      setStale(true)
      return
    }
    const { from, to, empty } = original.selection
    const chain = editor.chain().setTextSelection({ from, to })
    // A caret within a link edits the entire link; selected text keeps its exact range.
    let applied: boolean
    if (empty && original.href) {
      applied = chain.extendMarkRange('link').setLink({ href: value }).run()
    } else if (empty) {
      applied = chain.insertContent({ type: 'text', text: value, marks: [{ type: 'link', attrs: { href: value } }] }).run()
    } else {
      applied = chain.setLink({ href: value }).run()
    }
    if (applied) onClose()
    else setError('This URL cannot be applied. Check the URL and try again.')
  }

  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent initialFocus={inputRef} finalFocus={triggerRef} className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{original.href ? 'Edit link' : 'Insert link'}</DialogTitle>
        <DialogDescription id={`${id}-help`}>Use an http://, https://, or mailto: URL. With no text selected, the URL becomes the link text.</DialogDescription>
      </DialogHeader>
      <Label htmlFor={id}>URL</Label>
      <Input ref={inputRef} id={id} value={url} type="text" inputMode="url" autoComplete="off"
        aria-invalid={!!error} aria-describedby={[`${id}-help`, error ? `${id}-error` : undefined].filter(Boolean).join(' ')}
        onChange={event => { setUrl(event.target.value); setError('') }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); apply() } }} />
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
      {stale && <p role="alert" className="text-sm text-destructive">The document changed. Cancel and select the text again.</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={stale} onClick={apply}>Apply</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

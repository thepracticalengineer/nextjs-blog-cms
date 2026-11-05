'use client'

import { useId, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageContent } from '../PageContent'
import type { PageResult } from '../errors'
import { canCorrectWrite, writeErrorMessage } from '../management/feedback'
import { pagePatternLimits, pagePatternValuesSchema, type PagePattern, type PagePatternLibrary, type PagePatternValues, type PagePatternWrite } from '../schema'

/** Supplied by the caller so the editor stays independent of server actions. */
export type PagePatternSource = {
  list: () => Promise<PageResult<PagePatternLibrary>>
  write: (input: PagePatternWrite) => Promise<PageResult<{ pattern: PagePattern | null; replayed: boolean }>>
}

const reloadCodes = new Set(['PAGE_PATTERN_STALE', 'PAGE_PATTERN_NOT_FOUND'])

/**
 * Saved section patterns. Every insertion is an independent copy: a page keeps
 * no link to the pattern, so renaming, replacing or deleting a pattern never
 * changes pages (or published snapshots), and editing an inserted copy never
 * changes the pattern. There are no synced sections.
 */
export function PatternLibrary({ source, savable, readSelection, disabled, onInsert }: Readonly<{
  source: PagePatternSource
  /** Whether the selected block can be saved alone (not a column or list item). */
  savable: boolean
  /** Copies the selected block as pattern content, only when saving. */
  readSelection: () => JSONContent[] | null
  disabled?: boolean
  onInsert: (pattern: PagePattern) => void
}>) {
  const id = useId()
  const [library, setLibrary] = useState<PagePatternLibrary | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editing, setEditing] = useState<{ pattern: PagePattern; name: string; description: string } | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [pending, setPending] = useState<PagePatternWrite | null>(null)
  const ticket = useRef(0)
  const running = useRef(false)

  async function load() {
    const current = ++ticket.current
    setLoading(true)
    try {
      const result = await source.list()
      if (current !== ticket.current) return
      if (result.error) setMessage(result.error.message)
      else setLibrary(result.data)
    } catch { if (current === ticket.current) setMessage('Section patterns could not be loaded. Try again.') }
    finally { if (current === ticket.current) setLoading(false) }
  }

  async function send(request: PagePatternWrite, success: string) {
    if (running.current) return
    const retrying = pending !== null
    running.current = true; setBusy(true); setPending(request); setMessage('')
    try {
      const result = await source.write(request)
      if (result.error) {
        setMessage(writeErrorMessage(result.error, retrying))
        // Unknown outcomes keep the exact request for a confirming retry.
        if (canCorrectWrite(result.error, retrying)) setPending(null)
        if (reloadCodes.has(result.error.code)) void load()
        return
      }
      setPending(null)
      setMessage(result.data.replayed ? 'Pattern request confirmed. The list shows the current saved patterns.' : success)
      if (request.operation === 'create') { setName(''); setDescription('') }
      setEditing(null)
      void load()
    } catch { setMessage('The pattern request could not be confirmed. Retry it; nothing on this page changed.') }
    finally { running.current = false; setBusy(false) }
  }

  function save() {
    const selection = readSelection()
    if (!selection) { setMessage('Select a section, columns or another top-level block to save it as a pattern.'); return }
    const values: PagePatternValues = { name, description, document: { version: 2, content: { type: 'doc', content: selection } } } as PagePatternValues
    if (!pagePatternValuesSchema.safeParse(values).success) { setMessage(`Enter a pattern name (up to ${pagePatternLimits.name} characters) and an optional description (up to ${pagePatternLimits.description}).`); return }
    void send({ operation: 'create', requestKey: crypto.randomUUID(), values }, `Saved “${name.trim()}”. Pages using earlier copies are unchanged.`)
  }

  function rename() {
    if (!editing) return
    const values = { name: editing.name, description: editing.description, document: editing.pattern.document }
    if (!pagePatternValuesSchema.safeParse(values).success) { setMessage(`Enter a pattern name (up to ${pagePatternLimits.name} characters).`); return }
    void send({ operation: 'update', requestKey: crypto.randomUUID(), patternId: editing.pattern.id, expectedRevision: editing.pattern.revision, values }, 'Pattern details updated. Pages using copies are unchanged.')
  }

  function remove(pattern: { id: string; revision: string; name: string }) {
    if (!window.confirm(`Delete the pattern “${pattern.name}”? Pages that already contain copies of it keep their content.`)) return
    void send({ operation: 'delete', requestKey: crypto.randomUUID(), patternId: pattern.id, expectedRevision: pattern.revision }, 'Pattern deleted. Pages that contain copies keep their content.')
  }

  const locked = disabled || busy || pending !== null
  return <details className="flex flex-col gap-2" onToggle={event => { if ((event.currentTarget as HTMLDetailsElement).open && !library && !loading) void load() }}>
    <summary className="cursor-pointer font-semibold">Section patterns</summary>
    <div className="mt-2 flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">Inserting a pattern adds an independent copy. Changing or deleting a saved pattern never changes pages that already use it, and editing the copy never changes the pattern.</p>
      <output aria-live="polite" className="text-sm">{loading ? 'Loading patterns…' : message}</output>
      {pending && <Button size="sm" disabled={busy} onClick={() => void send(pending, 'Pattern request completed.')}>Retry previous pattern request</Button>}
      <fieldset disabled={locked} className="flex min-w-0 flex-col gap-2 rounded-md border p-2">
        <legend className="px-1 text-sm font-medium">Save selected block</legend>
        <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-name`}>Pattern name</label>
        <Input id={`${id}-name`} value={name} maxLength={pagePatternLimits.name} onChange={event => setName(event.target.value)} />
        <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-description`}>Description (optional)</label>
        <Input id={`${id}-description`} value={description} maxLength={pagePatternLimits.description} onChange={event => setDescription(event.target.value)} />
        <Button size="sm" variant="outline" disabled={!savable} onClick={save}>Save selection as pattern</Button>
        {!savable && <p className="text-xs text-muted-foreground">Select a section, columns or other top-level block first. Columns and list items cannot be saved alone.</p>}
      </fieldset>
      {library && library.patterns.length === 0 && library.unavailable.length === 0 && <p className="text-sm text-muted-foreground">No saved patterns yet.</p>}
      {library && library.patterns.length > 0 && <ul className="flex flex-col gap-2" aria-label="Saved section patterns">{library.patterns.map(pattern => <li key={pattern.id} className="flex min-w-0 flex-col gap-1 rounded-md border p-2">
        {editing?.pattern.id === pattern.id ? <fieldset disabled={locked} className="flex flex-col gap-1">
          <legend className="sr-only">Edit pattern details</legend>
          <label className="text-sm" htmlFor={`${id}-${pattern.id}-name`}>Pattern name</label>
          <Input id={`${id}-${pattern.id}-name`} value={editing.name} maxLength={pagePatternLimits.name} onChange={event => setEditing({ ...editing, name: event.target.value })} />
          <label className="text-sm" htmlFor={`${id}-${pattern.id}-description`}>Description (optional)</label>
          <Input id={`${id}-${pattern.id}-description`} value={editing.description} maxLength={pagePatternLimits.description} onChange={event => setEditing({ ...editing, description: event.target.value })} />
          <div className="flex flex-wrap gap-1"><Button size="sm" onClick={rename}>Save details</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
        </fieldset> : <>
          <span className="break-words font-medium">{pattern.name}</span>
          {pattern.description && <span className="break-words text-xs text-muted-foreground">{pattern.description}</span>}
          <span className="text-xs text-muted-foreground">{pattern.document.content.content?.length ?? 0} block{pattern.document.content.content?.length === 1 ? '' : 's'} · inserts a copy</span>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" disabled={disabled} aria-label={`Insert a copy of ${pattern.name}`} onClick={() => onInsert(pattern)}>Insert copy</Button>
            <Button size="sm" variant="ghost" aria-pressed={previewing === pattern.id} aria-label={`Preview ${pattern.name}`} onClick={() => setPreviewing(value => value === pattern.id ? null : pattern.id)}>Preview</Button>
            <Button size="sm" variant="ghost" disabled={locked} aria-label={`Rename ${pattern.name}`} onClick={() => setEditing({ pattern, name: pattern.name, description: pattern.description })}>Rename</Button>
            <Button size="sm" variant="ghost" disabled={locked} aria-label={`Delete ${pattern.name}`} onClick={() => remove(pattern)}>Delete</Button>
          </div>
        </>}
        {previewing === pattern.id && <div className="page-pattern-preview max-h-80 overflow-auto rounded border p-2" aria-label={`${pattern.name} preview`}><PageContent document={pattern.document} /></div>}
      </li>)}</ul>}
      {library && library.unavailable.length > 0 && <ul className="flex flex-col gap-2" aria-label="Unavailable section patterns">{library.unavailable.map(pattern => <li key={pattern.id} className="flex flex-col gap-1 rounded-md border border-dashed p-2">
        <span className="break-words font-medium">{pattern.name}</span>
        <span className="text-xs text-muted-foreground">{pattern.reason === 'PAGE_IMAGE_NOT_ALLOWED' ? 'Uses an image host that is no longer allowed. It cannot be inserted.' : 'Uses an unsupported format. It cannot be inserted until support is restored.'}</span>
        <Button size="sm" variant="ghost" disabled={locked} aria-label={`Delete ${pattern.name}`} onClick={() => remove(pattern)}>Delete</Button>
      </li>)}</ul>}
      {library && <Button size="sm" variant="ghost" disabled={loading} onClick={() => void load()}>Refresh patterns</Button>}
    </div>
  </details>
}

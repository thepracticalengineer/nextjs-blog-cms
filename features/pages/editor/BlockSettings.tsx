'use client'

import { useId, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { columnPresets, layoutDefaults, layoutOptions } from '../document'
import { setColumnPreset } from './operations'

const selectClass = 'h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring'
const labels: Record<string, string> = { width: 'Width', background: 'Background', padding: 'Padding', gap: 'Gap', align: 'Alignment' }

function update(editor: Editor, pos: number, attrs: Record<string, unknown>): boolean {
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return false
  const before = editor.state.doc
  editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }))
  return !before.eq(editor.state.doc)
}
function ButtonSettings({ editor, pos, node }: { editor: Editor; pos: number; node: Node }) {
  const id = useId()
  const [label, setLabel] = useState(String(node.attrs.label))
  const [href, setHref] = useState(String(node.attrs.href))
  const [variant, setVariant] = useState(String(node.attrs.variant))
  const [align, setAlign] = useState(String(node.attrs.align))
  const [error, setError] = useState('')
  return <form className="flex min-w-0 flex-col gap-3" onSubmit={event => {
    event.preventDefault()
    if (label === node.attrs.label && href === node.attrs.href && variant === node.attrs.variant && align === node.attrs.align) return
    if (!update(editor, pos, { label, href, variant, align })) setError('Use a label and a safe http, https, mailto, /path or #anchor link.')
    else setError('')
  }}>
    <Label htmlFor={`${id}-label`}>Label</Label>
    <Input id={`${id}-label`} value={label} maxLength={200} onChange={event => setLabel(event.target.value)} />
    <Label htmlFor={`${id}-href`}>Link</Label>
    <Input id={`${id}-href`} value={href} maxLength={2048} onChange={event => setHref(event.target.value)} />
    <Label htmlFor={`${id}-variant`}>Style</Label>
    <select id={`${id}-variant`} className={selectClass} value={variant} onChange={event => setVariant(event.target.value)}><option value="solid">Solid</option><option value="outline">Outline</option></select>
    <Label htmlFor={`${id}-align`}>Alignment</Label>
    <select id={`${id}-align`} className={selectClass} value={align} onChange={event => setAlign(event.target.value)}>{layoutOptions.align.map(value => <option key={value}>{value}</option>)}</select>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" variant="outline">Apply button</Button>
  </form>
}

export function BlockSettings({ editor, pos, onImage }: { editor: Editor; pos: number | null; onImage: () => void }) {
  const id = useId()
  const node = pos === null ? null : editor.state.doc.nodeAt(pos)
  if (!node || pos === null) return <p className="text-sm text-muted-foreground">Select a block in the canvas or outline.</p>
  if (node.type.name === 'button') return <ButtonSettings key={`${pos}-${JSON.stringify(node.attrs)}`} editor={editor} pos={pos} node={node} />
  if (node.type.name === 'image') return <Button variant="outline" onClick={onImage}>Edit image</Button>
  if (node.type.name === 'heading') return <label className="flex flex-col gap-2" htmlFor={`${id}-heading`}>Heading level
    <select className={selectClass} id={`${id}-heading`} value={node.attrs.level} onChange={event => update(editor, pos, { level: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>Heading {value}</option>)}</select>
  </label>
  if (!['section', 'columns', 'column'].includes(node.type.name)) return <p className="text-sm text-muted-foreground">Use the text toolbar to format this block.</p>
  return <div className="flex min-w-0 flex-col gap-3">
    {node.type.name === 'columns' && <label htmlFor={`${id}-preset`} className="flex flex-col gap-2 text-sm">Column preset
      <select id={`${id}-preset`} className={selectClass} value={node.attrs.preset} onChange={event => setColumnPreset(editor, pos, event.target.value)}>{columnPresets.map(value => <option key={value} value={value}>{value.replaceAll('-', ' ')}</option>)}</select>
      <span className="text-xs text-muted-foreground">Fewer columns moves their content into the last remaining column.</span>
    </label>}
    {Object.entries(layoutOptions).map(([key, values]) => <label key={key} htmlFor={`${id}-${key}`} className="flex flex-col gap-2 text-sm">{labels[key]}
      <select id={`${id}-${key}`} className={selectClass} value={node.attrs[key] ?? layoutDefaults[key as keyof typeof layoutDefaults]} onChange={event => update(editor, pos, { [key]: event.target.value })}>{values.map(value => <option key={value} value={value}>{value}</option>)}</select>
    </label>)}
  </div>
}

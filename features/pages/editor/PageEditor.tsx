'use client'

import { useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Button } from '@/components/ui/button'
import { ImageDialog } from '@/components/editor/ImageDialog'
import { LinkDialog } from '@/components/editor/LinkDialog'
import type { ImageValue } from '@/features/posts/media/validation'
import { PageContent } from '../PageContent'
import { pageDocumentSchema, toPageEditorDocument, isSafePageHref, type PageDocumentV2 } from '../document'
import type { PageDocument } from '../schema'
import { BlockSettings } from './BlockSettings'
import { createPageExtensions } from './extensions'
import { blockLabels, blockOutline, deletePageBlock, duplicatePageBlock, insertableBlocks, insertPageBlock, movePageBlock, reorderPageBlock, selectedBlockPosition, type BlockEntry, type InsertableBlock } from './operations'
import '../page-layout.css'
import './editor.css'

const pageLinkPolicy = { validate: isSafePageHref, description: 'Use an http://, https://, mailto:, /path or #anchor link.' }

export type PageEditorProps = {
  /** Initial document. Remount with a page/revision key to explicitly load another saved version. */
  document: PageDocument
  editorId: string
  onChange: (document: PageDocumentV2) => void
}

export function PageEditor(props: PageEditorProps) {
  const parsed = pageDocumentSchema.safeParse(props.document)
  if (!parsed.success) return <p role="alert">This page document is unsupported. Its saved content has not been changed.</p>
  // Validate the upgrade before mounting Tiptap; never silently discard legacy content over the new limits.
  const upgraded = { version: 2, content: toPageEditorDocument(parsed.data) }
  if (!pageDocumentSchema.safeParse(upgraded).success) return <p role="alert">This document exceeds the block editor limits. Its saved content has not been changed.</p>
  return <PageEditorCanvas {...props} />
}

function PageEditorCanvas({ document, editorId, onChange }: PageEditorProps) {
  const [initial] = useState(() => toPageEditorDocument(document))
  const [preview, setPreview] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [imageTarget, setImageTarget] = useState<{ pos: number | null; doc: ProseMirrorNode; initial?: ImageValue } | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const linkButton = useRef<HTMLButtonElement>(null)
  const outline = useRef<HTMLElement>(null)
  const drag = useRef<{ pos: number; doc: ProseMirrorNode } | null>(null)
  const editor = useEditor({
    extensions: createPageExtensions(() => setError('That change exceeds the page limits or contains an unsupported block, setting or link. Your content is preserved.')),
    content: initial,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: 'page-document', 'aria-label': 'Page canvas', role: 'textbox', 'aria-multiline': 'true' },
      handleClick: (_view, _pos, event) => { if ((event.target as Element).closest('a')) event.preventDefault(); return false },
    },
    onUpdate: ({ editor }) => { setError(''); onChange({ version: 2, content: editor.getJSON() }) },
  })
  if (!editor) return <p role="status">Loading page canvas…</p>
  const selected = selectedBlockPosition(editor)
  const node = selected === null ? null : editor.state.doc.nodeAt(selected)
  const entries = blockOutline(editor.state.doc)
  function focusOutline() {
    requestAnimationFrame(() => {
      const position = selectedBlockPosition(editor!)
      outline.current?.querySelector<HTMLButtonElement>(`[data-block-pos="${position}"]`)?.focus()
    })
  }
  function move(pos: number, direction: -1 | 1) {
    if (movePageBlock(editor!, pos, direction)) {
      setNotice(`Block moved ${direction < 0 ? 'up' : 'down'}.`)
      focusOutline()
    }
  }
  function openImage(edit = false) {
    const current = selected === null ? null : editor!.state.doc.nodeAt(selected)
    setImageTarget({ pos: selected, doc: editor!.state.doc, ...(edit && current?.type.name === 'image' ? { initial: current.attrs as ImageValue } : {}) })
  }
  function add(type: InsertableBlock) {
    if (type === 'image') { openImage(); return }
    if (insertPageBlock(editor!, selected, type)) { setNotice(`${blockLabels[type]} added.`); focusOutline() }
    else setError('Select a section, column or top-level block to insert here.')
  }
  function tree(items: BlockEntry[]) {
    return <ol className="page-block-list">{items.map((entry, index) => <li key={entry.pos}>
      <button type="button" className="page-block-select" data-block-pos={entry.pos} aria-label={`Select ${blockLabels[entry.node.type.name] ?? entry.node.type.name} ${index + 1}`} aria-pressed={selected === entry.pos}
        draggable onDragStart={event => {
          drag.current = { pos: entry.pos, doc: editor!.state.doc }
          event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(entry.pos))
        }} onDragEnd={() => { drag.current = null }} onDragOver={event => { if (drag.current) event.preventDefault() }}
        onDrop={event => {
          event.preventDefault(); event.stopPropagation()
          const source = drag.current; drag.current = null
          if (source && source.doc.eq(editor!.state.doc) && reorderPageBlock(editor!, source.pos, entry.pos)) { setNotice('Block reordered.'); focusOutline() }
          else setNotice('Move blocks within the same parent. Use the inserter for nested content.')
        }}
        onClick={() => editor!.commands.setNodeSelection(entry.pos)}
        onKeyDown={event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); move(entry.pos, event.key === 'ArrowUp' ? -1 : 1) } }}
      >{blockLabels[entry.node.type.name] ?? entry.node.type.name} {index + 1}</button>
      {entry.children.length > 0 && tree(entry.children)}
    </li>)}</ol>
  }
  return <div className="page-editor flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-center gap-2" aria-label="Page editor controls">
      <Button variant="outline" disabled={!editor.can().undo()} onClick={() => editor.commands.undo()}>Undo</Button>
      <Button variant="outline" disabled={!editor.can().redo()} onClick={() => editor.commands.redo()}>Redo</Button>
      <Button variant={preview ? 'default' : 'outline'} aria-pressed={preview} onClick={() => setPreview(value => !value)}>{preview ? 'Edit canvas' : 'Preview'}</Button>
      <span className="text-xs text-muted-foreground">{preview ? 'Private preview · current unsaved content' : 'Page canvas · changes remain private until published'}</span>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <p role="status" aria-live="polite" className="sr-only">{notice}</p>
    {preview ? <PageContent document={{ version: 2, content: editor.getJSON() }} /> : <div className="page-editor-grid">
      <aside className="page-editor-panel flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-2"><h2 className="font-semibold">Add a block</h2><p className="text-xs text-muted-foreground">Select a section or column to insert inside it. Other blocks insert after the selection.</p>
          <div className="grid grid-cols-2 gap-1">{insertableBlocks.map(type => <Button key={type} size="sm" variant="outline" onClick={() => add(type)} aria-label={`Add ${blockLabels[type]}`}>{blockLabels[type]}</Button>)}</div>
        </div>
        <nav ref={outline} aria-label="Block outline" className="flex min-w-0 flex-col gap-2">
          <h2 className="font-semibold">Block outline</h2><p className="text-xs text-muted-foreground">Drag siblings to reorder, or use Alt + ↑ / ↓ and the move buttons.</p>{tree(entries)}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap gap-1" aria-label="Text formatting">
          <Button size="sm" variant="outline" aria-pressed={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>Bold</Button>
          <Button size="sm" variant="outline" aria-pressed={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>Italic</Button>
          <Button size="sm" variant="outline" aria-pressed={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>Underline</Button>
          <Button ref={linkButton} size="sm" variant="outline" onClick={() => setLinkOpen(true)}>Link</Button>
          <Button size="sm" variant="outline" disabled={!editor.isActive('link')} onClick={() => editor.chain().focus().unsetLink().run()}>Remove link</Button>
        </div>
        <EditorContent editor={editor} className="page-canvas page-editor-canvas" />
      </div>
      <aside className="page-editor-panel flex min-w-0 flex-col gap-4" aria-label="Block settings">
        <h2 className="font-semibold">{node ? `${blockLabels[node.type.name]} settings` : 'Block settings'}</h2>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" disabled={selected === null || editor.state.doc.resolve(selected).index() === 0} onClick={() => selected !== null && move(selected, -1)}>Move up</Button>
          <Button size="sm" variant="outline" disabled={selected === null || editor.state.doc.resolve(selected).index() >= editor.state.doc.resolve(selected).parent.childCount - 1} onClick={() => selected !== null && move(selected, 1)}>Move down</Button>
          <Button size="sm" variant="outline" disabled={selected === null || node?.type.name === 'column'} onClick={() => {
            if (selected !== null && duplicatePageBlock(editor, selected)) { setNotice('Block duplicated.'); focusOutline() }
          }}>Duplicate block</Button>
          <Button size="sm" variant="destructive" disabled={selected === null || node?.type.name === 'column'} onClick={() => {
            if (selected !== null && deletePageBlock(editor, selected)) { setNotice('Block deleted. Undo to restore it.'); editor.commands.focus() }
          }}>Delete block</Button>
        </div>
        <BlockSettings editor={editor} pos={selected} onImage={() => openImage(true)} />
      </aside>
    </div>}
    {linkOpen && <LinkDialog editor={editor} linkPolicy={pageLinkPolicy} triggerRef={linkButton} onClose={() => setLinkOpen(false)} />}
    {imageTarget && <ImageDialog context="page" editorId={editorId} initial={imageTarget.initial} onClose={() => setImageTarget(null)} onSave={image => {
      if (!imageTarget.doc.eq(editor.state.doc)) { setError('The document changed. Select the image position again.'); return }
      if (imageTarget.initial && imageTarget.pos !== null) {
        const current = editor.state.doc.nodeAt(imageTarget.pos)
        if (current?.type.name === 'image') editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(imageTarget.pos, undefined, { ...current.attrs, ...image, assetId: image.assetId ?? null }))
      } else insertPageBlock(editor, imageTarget.pos, 'image', image)
      setNotice('Image applied.'); focusOutline()
    }} />}
  </div>
}

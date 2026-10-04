'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Editor } from '@tiptap/react'
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, ListTodo, Quote, Code,
  Link, Image as ImageIcon, Minus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ToolbarProps {
  editor: Editor
}

// ── Color palettes ────────────────────────────────────────────────────────────
const TEXT_COLORS = [
  { hex: '#000000', label: 'Black' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#eab308', label: 'Yellow' },
  { hex: '#22c55e', label: 'Green' },
  { hex: '#3b82f6', label: 'Blue' },
  { hex: '#8b5cf6', label: 'Purple' },
  { hex: '#ec4899', label: 'Pink' },
  { hex: '#6b7280', label: 'Gray' },
  { hex: '#92400e', label: 'Brown' },
  { hex: '#166534', label: 'Dark Green' },
  { hex: '#1e3a8a', label: 'Navy' },
  { hex: '#4c1d95', label: 'Dark Purple' },
  { hex: '#9f1239', label: 'Dark Red' },
  { hex: '#d1d5db', label: 'Light Gray' },
  { hex: '#ffffff', label: 'White' },
]

const HIGHLIGHT_COLORS = [
  { hex: '#fef9c3', label: 'Yellow' },
  { hex: '#fee2e2', label: 'Red' },
  { hex: '#dcfce7', label: 'Green' },
  { hex: '#dbeafe', label: 'Blue' },
  { hex: '#ede9fe', label: 'Purple' },
  { hex: '#fce7f3', label: 'Pink' },
  { hex: '#ffedd5', label: 'Orange' },
  { hex: '#e0f2fe', label: 'Sky' },
]

const LINE_HEIGHTS = ['1', '1.5', '2', '2.5', '3']

// ── Heading helpers ───────────────────────────────────────────────────────────
const HEADING_OPTIONS = [
  { label: 'Normal', action: (e: Editor) => e.chain().focus().setParagraph().run() },
  { label: 'Heading 1', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'Heading 2', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'Heading 3', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: 'Heading 4', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 4 }).run() },
]

function getHeadingLabel(editor: Editor): string {
  for (let level = 1; level <= 4; level++) {
    if (editor.isActive('heading', { level })) return `Heading ${level}`
  }
  return 'Normal'
}

// ── ColorPanel (portal) ───────────────────────────────────────────────────────
interface ColorPanelProps {
  editor: Editor
  triggerRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}

function ColorPanel({ editor, triggerRef, onClose }: ColorPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  // Position below trigger
  useEffect(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX })
  }, [triggerRef])

  // Close on outside mousedown — guard with contains() so swatch clicks don't close early
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current?.contains(e.target as Node)) return
      if (triggerRef.current?.contains(e.target as Node)) return
      onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, triggerRef])

  const activeColor = editor.getAttributes('textStyle').color ?? null
  const activeHighlight = editor.getAttributes('highlight').color ?? null

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'absolute', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="bg-popover border border-border rounded-lg shadow-lg p-3 w-64"
    >
      {/* Text color section */}
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Text Color</p>
      <div className="grid grid-cols-8 gap-1 mb-3">
        {TEXT_COLORS.map(({ hex, label }) => (
          <button
            key={hex}
            type="button"
            title={label}
            style={{ background: hex }}
            className={`w-6 h-6 rounded-sm cursor-pointer border ${hex === '#ffffff' ? 'border-border' : 'border-transparent'} ${activeColor === hex ? 'ring-2 ring-primary ring-offset-1' : ''}`}
            onClick={() => {
              if (activeColor === hex) {
                editor.chain().focus().unsetColor().run()
              } else {
                editor.chain().focus().setColor(hex).run()
              }
              onClose()
            }}
          />
        ))}
      </div>

      {/* Highlight section */}
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Highlight</p>
      <div className="grid grid-cols-8 gap-1">
        {HIGHLIGHT_COLORS.map(({ hex, label }) => (
          <button
            key={hex}
            type="button"
            title={label}
            style={{ background: hex }}
            className={`w-6 h-6 rounded-sm cursor-pointer border border-border ${activeHighlight === hex ? 'ring-2 ring-primary ring-offset-1' : ''}`}
            onClick={() => {
              if (activeHighlight === hex) {
                editor.chain().focus().unsetHighlight().run()
              } else {
                editor.chain().focus().toggleHighlight({ color: hex }).run()
              }
              onClose()
            }}
          />
        ))}
      </div>
    </div>,
    document.body
  )
}

// ── LineHeightMenu ────────────────────────────────────────────────────────────
interface LineHeightMenuProps {
  editor: Editor
  activeLineHeight: string | null
}

function LineHeightMenu({ editor, activeLineHeight }: LineHeightMenuProps) {
  const [customValue, setCustomValue] = useState('')

  function applyCustom() {
    const n = parseFloat(customValue)
    if (!customValue || isNaN(n) || n < 0.5 || n > 10) return
    editor.chain().focus().setLineHeight(String(n)).run()
    setCustomValue('')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center justify-between h-8 px-2 text-xs min-w-[52px] rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground gap-1"
        title="Line spacing"
      >
        <span>↕</span>
        <span>{activeLineHeight ?? 'Default'}</span>
        <span className="opacity-50">▾</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[120px] w-auto">
        <DropdownMenuItem onSelect={() => editor.chain().focus().unsetLineHeight().run()}>
          <span className={!activeLineHeight ? 'font-semibold' : ''}>Default</span>
        </DropdownMenuItem>
        {LINE_HEIGHTS.map((lh) => (
          <DropdownMenuItem key={lh} onSelect={() => {
            if (activeLineHeight === lh) {
              editor.chain().focus().unsetLineHeight().run()
            } else {
              editor.chain().focus().setLineHeight(lh).run()
            }
          }}>
            <span className={activeLineHeight === lh ? 'font-semibold' : ''}>{lh}</span>
          </DropdownMenuItem>
        ))}
        {/* Custom input — stop propagation so the menu stays open */}
        <div
          className="px-2 pt-1 pb-2 border-t border-border mt-1"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Custom</p>
          <div className="flex gap-1">
            <input
              type="number"
              min={0.5}
              max={10}
              step={0.1}
              placeholder="e.g. 1.8"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyCustom() }}
              className="h-7 w-full rounded-sm border border-input bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={applyCustom}
              className="h-7 px-2 rounded-sm bg-primary text-primary-foreground text-xs hover:bg-primary/90"
            >
              Set
            </button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
export function Toolbar({ editor }: ToolbarProps) {
  const [colorPanelOpen, setColorPanelOpen] = useState(false)
  const colorTriggerRef = useRef<HTMLDivElement | null>(null)

  function addLink() {
    const url = window.prompt('Enter URL')
    if (url) editor.chain().focus().setLink({ href: url }).run()
  }

  function addImage() {
    const url = window.prompt('Enter image URL')
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }

  const activeLineHeight =
    editor.getAttributes('paragraph').lineHeight ??
    editor.getAttributes('heading').lineHeight ??
    null

  const activeColor = editor.getAttributes('textStyle').color ?? '#000000'
  const activeHighlight = editor.getAttributes('highlight').color ?? '#fef9c3'

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-muted/30">

      {/* Group 1: Heading dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex items-center justify-between h-8 px-2 text-xs min-w-[90px] rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground">
          {getHeadingLabel(editor)}
          <span className="ml-1 opacity-50">▾</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[140px] w-auto">
          {HEADING_OPTIONS.map(({ label, action }) => (
            <DropdownMenuItem key={label} onSelect={() => action(editor)}>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Group 2: Inline formatting */}
      {[
        { icon: Bold, action: () => editor.chain().focus().toggleBold().run(), isActive: editor.isActive('bold'), title: 'Bold' },
        { icon: Italic, action: () => editor.chain().focus().toggleItalic().run(), isActive: editor.isActive('italic'), title: 'Italic' },
        { icon: Underline, action: () => editor.chain().focus().toggleUnderline().run(), isActive: editor.isActive('underline'), title: 'Underline' },
        { icon: Strikethrough, action: () => editor.chain().focus().toggleStrike().run(), isActive: editor.isActive('strike'), title: 'Strikethrough' },
      ].map(({ icon: Icon, action, isActive, title }) => (
        <Button key={title} type="button" variant={isActive ? 'secondary' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={action} title={title}>
          <Icon className="h-4 w-4" />
        </Button>
      ))}
      {/* Subscript / Superscript as compact text buttons */}
      <Button type="button" variant={editor.isActive('subscript') ? 'secondary' : 'ghost'} size="sm" className="h-8 w-8 p-0 text-xs" onClick={() => editor.chain().focus().toggleSubscript().run()} title="Subscript">
        X<sub>2</sub>
      </Button>
      <Button type="button" variant={editor.isActive('superscript') ? 'secondary' : 'ghost'} size="sm" className="h-8 w-8 p-0 text-xs" onClick={() => editor.chain().focus().toggleSuperscript().run()} title="Superscript">
        X<sup>2</sup>
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Group 3: Color & Highlight — both buttons share one panel anchored to a wrapper ref */}
      <div ref={colorTriggerRef} className="flex items-center">
        <button
          type="button"
          title="Text color"
          className="h-8 w-auto px-1.5 rounded-sm hover:bg-accent flex flex-col items-center justify-center gap-0.5"
          onClick={() => setColorPanelOpen(o => !o)}
        >
          <span className="text-xs font-semibold leading-none">A</span>
          <span className="block h-0.5 w-4 rounded-sm" style={{ background: activeColor }} />
        </button>
        <button
          type="button"
          title="Highlight"
          className="h-8 w-auto px-1.5 rounded-sm hover:bg-accent flex flex-col items-center justify-center gap-0.5"
          onClick={() => setColorPanelOpen(o => !o)}
        >
          <span className="text-xs font-semibold leading-none" style={{ background: activeHighlight, padding: '0 2px', borderRadius: 2 }}>A</span>
          <span className="block h-0.5 w-4 rounded-sm" style={{ background: activeHighlight }} />
        </button>
      </div>

      {colorPanelOpen && (
        <ColorPanel
          editor={editor}
          triggerRef={colorTriggerRef}
          onClose={() => setColorPanelOpen(false)}
        />
      )}

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Group 4: Alignment */}
      {[
        { icon: AlignLeft, align: 'left', title: 'Align Left' },
        { icon: AlignCenter, align: 'center', title: 'Align Center' },
        { icon: AlignRight, align: 'right', title: 'Align Right' },
        { icon: AlignJustify, align: 'justify', title: 'Justify' },
      ].map(({ icon: Icon, align, title }) => (
        <Button key={align} type="button" variant={editor.isActive({ textAlign: align }) ? 'secondary' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={() => editor.chain().focus().setTextAlign(align).run()} title={title}>
          <Icon className="h-4 w-4" />
        </Button>
      ))}

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Group 5: Blocks */}
      {[
        { icon: List, action: () => editor.chain().focus().toggleBulletList().run(), isActive: editor.isActive('bulletList'), title: 'Bullet List' },
        { icon: ListOrdered, action: () => editor.chain().focus().toggleOrderedList().run(), isActive: editor.isActive('orderedList'), title: 'Ordered List' },
        { icon: ListTodo, action: () => editor.chain().focus().toggleTaskList().run(), isActive: editor.isActive('taskList'), title: 'Task List' },
        { icon: Quote, action: () => editor.chain().focus().toggleBlockquote().run(), isActive: editor.isActive('blockquote'), title: 'Blockquote' },
        { icon: Code, action: () => editor.chain().focus().toggleCodeBlock().run(), isActive: editor.isActive('codeBlock'), title: 'Code Block' },
      ].map(({ icon: Icon, action, isActive, title }) => (
        <Button key={title} type="button" variant={isActive ? 'secondary' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={action} title={title}>
          <Icon className="h-4 w-4" />
        </Button>
      ))}

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Group 6: Insert */}
      <Button type="button" variant={editor.isActive('link') ? 'secondary' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={addLink} title="Link">
        <Link className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={addImage} title="Image">
        <ImageIcon className="h-4 w-4" />
      </Button>
<Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
        <Minus className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Group 7: Line height dropdown */}
      <LineHeightMenu editor={editor} activeLineHeight={activeLineHeight} />

    </div>
  )
}

import type { Editor, JSONContent } from '@tiptap/core'
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'

export const blockLabels: Record<string, string> = {
  section: 'Section', columns: 'Columns', column: 'Column', paragraph: 'Paragraph', heading: 'Heading',
  button: 'Button', image: 'Image', horizontalRule: 'Separator', bulletList: 'Bullet list', orderedList: 'Numbered list',
  listItem: 'List item', blockquote: 'Quote', codeBlock: 'Code',
}
export const insertableBlocks = ['paragraph', 'heading', 'section', 'columns', 'button', 'image', 'horizontalRule', 'bulletList', 'orderedList', 'blockquote', 'codeBlock'] as const
export type InsertableBlock = typeof insertableBlocks[number]
export type BlockEntry = { pos: number; node: ProseMirrorNode; children: BlockEntry[] }

export function blockOutline(doc: ProseMirrorNode): BlockEntry[] {
  function children(node: ProseMirrorNode, start: number): BlockEntry[] {
    const entries: BlockEntry[] = []
    node.forEach((child, offset) => {
      if (!child.isBlock) return
      const pos = start + offset
      entries.push({ pos, node: child, children: children(child, pos + 1) })
    })
    return entries
  }
  return children(doc, 0)
}
export function selectedBlockPosition(editor: Editor): number | null {
  const { selection } = editor.state
  if (selection instanceof NodeSelection) return selection.from
  const { $from } = selection
  return $from.depth ? $from.before($from.depth) : null
}
function location(editor: Editor, pos: number) {
  if (pos < 0 || pos >= editor.state.doc.content.size) return null
  const $pos = editor.state.doc.resolve(pos)
  const node = $pos.nodeAfter
  return node?.isBlock ? { node, parent: $pos.parent, index: $pos.index(), start: $pos.start() } : null
}
function apply(editor: Editor, from: number, to: number, content: Fragment | ProseMirrorNode, selected: number): boolean {
  const before = editor.state.doc
  const transaction = closeHistory(editor.state.tr).replaceWith(from, to, content)
  transaction.setSelection(NodeSelection.create(transaction.doc, selected))
  editor.view.dispatch(transaction.scrollIntoView())
  return !editor.state.doc.eq(before)
}
export function movePageBlock(editor: Editor, pos: number, direction: -1 | 1): boolean {
  const entry = location(editor, pos)
  if (!entry) return false
  const targetIndex = entry.index + direction
  if (targetIndex < 0 || targetIndex >= entry.parent.childCount) return false
  const other = entry.parent.child(targetIndex)
  const from = direction < 0 ? pos - other.nodeSize : pos
  const to = direction < 0 ? pos + entry.node.nodeSize : pos + entry.node.nodeSize + other.nodeSize
  return apply(editor, from, to, Fragment.fromArray(direction < 0 ? [entry.node, other] : [other, entry.node]), direction < 0 ? from : from + other.nodeSize)
}
/** Outline dragging is deliberately limited to siblings, matching keyboard movement. */
export function reorderPageBlock(editor: Editor, source: number, target: number): boolean {
  const a = location(editor, source), b = location(editor, target)
  if (!a || !b || a.parent !== b.parent || source === target) return false
  const children: ProseMirrorNode[] = []
  a.parent.forEach(child => children.push(child))
  children.splice(a.index, 1)
  children.splice(b.index, 0, a.node)
  const selected = a.start + children.slice(0, b.index).reduce((size, node) => size + node.nodeSize, 0)
  return apply(editor, a.start, a.start + a.parent.content.size, Fragment.fromArray(children), selected)
}
export function duplicatePageBlock(editor: Editor, pos: number): boolean {
  const entry = location(editor, pos)
  if (!entry || entry.node.type.name === 'column') return false
  return apply(editor, pos + entry.node.nodeSize, pos + entry.node.nodeSize, entry.node, pos + entry.node.nodeSize)
}
export function deletePageBlock(editor: Editor, pos: number): boolean {
  const entry = location(editor, pos)
  if (!entry || entry.node.type.name === 'column') return false
  const replacement = entry.parent.childCount === 1 ? editor.schema.nodes.paragraph.create() : Fragment.empty
  const tr = closeHistory(editor.state.tr).replaceWith(pos, pos + entry.node.nodeSize, replacement)
  const before = editor.state.doc
  editor.view.dispatch(tr.scrollIntoView())
  return !editor.state.doc.eq(before)
}
export function newPageBlock(type: Exclude<InsertableBlock, 'image'>): JSONContent {
  const paragraph = { type: 'paragraph' }
  switch (type) {
    case 'section': return { type, content: [paragraph] }
    case 'columns': return { type, attrs: { preset: 'equal-two' }, content: [{ type: 'column', content: [paragraph] }, { type: 'column', content: [paragraph] }] }
    case 'heading': return { type, attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] }
    case 'button': return { type }
    case 'bulletList': case 'orderedList': return { type, content: [{ type: 'listItem', content: [paragraph] }] }
    case 'blockquote': return { type, content: [paragraph] }
    default: return { type }
  }
}
export function insertPageBlock(editor: Editor, selected: number | null, type: InsertableBlock, image?: JSONContent['attrs']): boolean {
  if (type === 'image' && !image) return false
  const entry = selected === null ? null : location(editor, selected)
  let pos = editor.state.doc.content.size
  if (entry && selected !== null) {
    if (['section', 'column'].includes(entry.node.type.name)) pos = selected + entry.node.nodeSize - 1
    else if (entry.node.type.name === 'columns') pos = selected + 1 + entry.node.child(0).nodeSize - 1
    else pos = selected + entry.node.nodeSize
  }
  const node = editor.schema.nodeFromJSON(type === 'image' ? { type, attrs: image } : newPageBlock(type))
  const $pos = editor.state.doc.resolve(pos)
  if (!$pos.parent.canReplaceWith($pos.index(), $pos.index(), node.type)) return false
  return apply(editor, pos, pos, node, pos)
}
export function setColumnPreset(editor: Editor, pos: number, preset: string): boolean {
  const entry = location(editor, pos)
  if (!entry || entry.node.type.name !== 'columns') return false
  const counts: Record<string, number> = { one: 1, 'equal-two': 2, 'wide-left': 2, 'wide-right': 2, 'equal-three': 3 }
  const count = counts[preset]
  if (!count) return false
  const columns: ProseMirrorNode[] = []
  entry.node.forEach(column => columns.push(column))
  while (columns.length < count) columns.push(editor.schema.nodes.column.createAndFill()!)
  if (columns.length > count) {
    // Reducing a preset never discards hidden content: append it to the last retained column.
    const kept = columns[count - 1]
    const merged = columns.slice(count).reduce((content, node) => content.append(node.content), kept.content)
    columns.splice(count - 1, columns.length, kept.copy(merged))
  }
  const replacement = entry.node.type.create({ ...entry.node.attrs, preset }, columns)
  return apply(editor, pos, pos + entry.node.nodeSize, replacement, pos)
}

import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { createPageExtensions } from '@/features/pages/editor/extensions'
import { insertPageBlock, movePageBlock, duplicatePageBlock, deletePageBlock, setColumnPreset } from '@/features/pages/editor/operations'
import { pageDocumentSchema } from '@/features/pages/schema'

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
let editor: Editor
function create(content = [paragraph('First'), paragraph('Second')]) {
  editor = new Editor({ extensions: createPageExtensions(), content: { type: 'doc', content } })
  return editor
}
afterEach(() => editor?.destroy())
describe('page editor structural transactions', () => {
  it('moves siblings with a selected block and one-step undo/redo', () => {
    create()
    expect(movePageBlock(editor, 0, 1)).toBe(true)
    expect(editor.state.doc.textContent).toBe('SecondFirst')
    expect(editor.state.selection.from).toBe(8)
    editor.commands.undo()
    expect(editor.state.doc.textContent).toBe('FirstSecond')
    editor.commands.redo()
    expect(editor.state.doc.textContent).toBe('SecondFirst')
  })
  it('duplicates and deletes without invalidating the document', () => {
    create()
    expect(duplicatePageBlock(editor, 0)).toBe(true)
    expect(editor.state.doc.textContent).toBe('FirstFirstSecond')
    expect(deletePageBlock(editor, 0)).toBe(true)
    expect(editor.state.doc.textContent).toBe('FirstSecond')
  })
  it('inserts nested columns and preserves text when reducing column count', () => {
    create([])
    expect(insertPageBlock(editor, null, 'columns')).toBe(true)
    const col = editor.state.doc.firstChild!
    expect(col.type.name).toBe('columns')
    editor.commands.insertContentAt(3, 'Left')
    editor.commands.insertContentAt(editor.state.doc.firstChild!.child(0).nodeSize + 3, 'Right')
    expect(setColumnPreset(editor, 0, 'one')).toBe(true)
    expect(editor.state.doc.firstChild!.childCount).toBe(1)
    expect(editor.state.doc.textContent).toBe('LeftRight')
    expect(pageDocumentSchema.safeParse({ version: 2, content: editor.getJSON() }).success).toBe(true)
    editor.commands.undo()
    expect(editor.state.doc.firstChild!.childCount).toBe(2)
  })
  it('roundtrips image dimensions and asset identity through editor HTML', () => {
    create([])
    insertPageBlock(editor, null, 'image', { src: '/diagram.png', alt: 'Diagram', width: 800, height: 600, assetId: '28700000-0000-4000-8000-000000000001' })
    const html = editor.getHTML()
    editor.commands.setContent({ type: 'doc', content: [paragraph('Replacement')] })
    editor.commands.setContent(html)
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: 'image', attrs: { width: 800, height: 600, assetId: '28700000-0000-4000-8000-000000000001' } })
  })
  it('rejects deleting/duplicating a column and malformed pasted layout', () => {
    create([])
    insertPageBlock(editor, null, 'columns')
    expect(deletePageBlock(editor, 1)).toBe(false)
    expect(duplicatePageBlock(editor, 1)).toBe(false)
    const before = editor.getJSON()
    editor.commands.setNodeSelection(0)
    editor.commands.updateAttributes('columns', { preset: 'equal-three' })
    expect(editor.getJSON()).toEqual(before)
  })
})

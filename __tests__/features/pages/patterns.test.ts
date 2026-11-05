import { afterEach, describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import { createPageExtensions } from '@/features/pages/editor/extensions'
import { canSavePattern, insertPageBlock, insertPagePattern, patternBlocksFromSelection } from '@/features/pages/editor/operations'
import { pageDocumentSchema, pagePatternValuesSchema, pagePatternWriteSchema } from '@/features/pages/schema'

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const hero = { type: 'section', attrs: { background: 'muted' }, content: [paragraph('Shared hero')] }
let editor: Editor
function create(content: JSONContent[] = [paragraph('First')]) {
  editor = new Editor({ extensions: createPageExtensions(), content: { type: 'doc', content } })
  return editor
}
afterEach(() => editor?.destroy())
const patternDocument = (content: JSONContent[]) => ({ version: 2 as const, content: { type: 'doc', content } })

describe('section pattern editing', () => {
  it('saves a selected top-level block and round-trips it into another page unchanged', () => {
    create([hero, paragraph('After')])
    const blocks = patternBlocksFromSelection(editor, 0)!
    expect(pagePatternValuesSchema.safeParse({ name: 'Hero', description: '', document: patternDocument(blocks) }).success).toBe(true)
    const saved = editor.getJSON().content![0]
    editor.destroy()
    create([paragraph('Target')])
    expect(insertPagePattern(editor, 0, blocks)).toBe(true)
    expect(editor.getJSON().content![1]).toEqual(saved)
    expect(pageDocumentSchema.safeParse({ version: 2, content: editor.getJSON() }).success).toBe(true)
  })
  it('inserts an independent copy: editing either side never changes the other', () => {
    create()
    const blocks: JSONContent[] = [structuredClone(hero)]
    const original = structuredClone(blocks)
    expect(insertPagePattern(editor, null, blocks)).toBe(true)
    expect(insertPagePattern(editor, null, blocks)).toBe(true)
    editor.commands.insertContentAt(3 + 'First'.length + 2 + 1, 'Edited ')
    expect(blocks).toEqual(original)
    const [first, second] = editor.getJSON().content!.slice(1)
    expect(first).not.toEqual(second)
    blocks[0].content![0].content![0].text = 'Pattern changed later'
    expect(editor.state.doc.textContent).not.toContain('Pattern changed later')
  })
  it('places patterns inside a selected section and refuses columns and list items as standalone patterns', () => {
    create([])
    insertPageBlock(editor, null, 'columns')
    expect(canSavePattern(editor, 0)).toBe(true)
    expect(canSavePattern(editor, 1)).toBe(false)
    expect(patternBlocksFromSelection(editor, 1)).toBeNull()
    editor.commands.setContent({ type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('Item')] }] }] })
    expect(canSavePattern(editor, 1)).toBe(false)
    editor.commands.setContent({ type: 'doc', content: [{ type: 'section', content: [paragraph('Inside')] }] })
    expect(insertPagePattern(editor, 0, [paragraph('Nested')])).toBe(true)
    expect(editor.getJSON().content).toHaveLength(1)
    expect(editor.state.doc.firstChild!.textContent).toBe('InsideNested')
  })
  it('rejects insertions that break nesting limits or the schema, leaving the document unchanged', () => {
    let deep: JSONContent = paragraph('Deep')
    for (let depth = 0; depth < 10; depth++) deep = { type: 'section', content: [deep] }
    create([{ type: 'section', content: [paragraph('Host')] }])
    const before = editor.getJSON()
    expect(insertPagePattern(editor, 0, [deep])).toBe(false)
    expect(editor.getJSON()).toEqual(before)
    expect(insertPagePattern(editor, 0, [{ type: 'column', content: [paragraph('Bare')] }])).toBe(false)
    expect(insertPagePattern(editor, 0, [{ type: 'unknown' }])).toBe(false)
    expect(insertPagePattern(editor, 0, [])).toBe(false)
    expect(editor.getJSON()).toEqual(before)
  })
  it('validates pattern values with page document rules and explicit bounds', () => {
    const valid = { name: 'Hero', description: '', document: patternDocument([hero]) }
    expect(pagePatternValuesSchema.safeParse(valid).success).toBe(true)
    expect(pagePatternValuesSchema.safeParse({ ...valid, name: '  ' }).success).toBe(false)
    expect(pagePatternValuesSchema.safeParse({ ...valid, name: 'x'.repeat(121) }).success).toBe(false)
    expect(pagePatternValuesSchema.safeParse({ ...valid, document: patternDocument([]) }).success).toBe(false)
    expect(pagePatternValuesSchema.safeParse({ ...valid, document: patternDocument(Array.from({ length: 101 }, () => ({ type: 'horizontalRule' }))) }).success).toBe(false)
    expect(pagePatternValuesSchema.safeParse({ ...valid, document: { version: 1, blocks: [{ type: 'paragraph', text: 'x' }] } }).success).toBe(false)
    expect(pagePatternValuesSchema.safeParse({ ...valid, document: patternDocument([{ type: 'button', attrs: { label: 'x', href: 'javascript:alert(1)' } }]) }).success).toBe(false)
    expect(pagePatternWriteSchema.safeParse({ operation: 'delete', requestKey: 'k', patternId: crypto.randomUUID(), expectedRevision: crypto.randomUUID(), values: valid }).success).toBe(false)
  })
})

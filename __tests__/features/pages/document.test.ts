import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { createPageExtensions } from '@/features/pages/editor/extensions'
import { pageDocumentSchema, toPageEditorDocument } from '@/features/pages/document'
const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'hello 😀' }] }
const doc = (content: unknown[]) => ({ version: 2, content: { type: 'doc', content } })
describe('page editor document contract', () => {
  it('roundtrips marked hard breaks emitted by the actual Tiptap extensions', () => {
    const editor = new Editor({ extensions: createPageExtensions(), content: { type: 'doc', content: [{ type: 'paragraph' }] } })
    try {
      editor.commands.toggleBold()
      editor.commands.insertContent('Before')
      editor.commands.setHardBreak()
      editor.commands.insertContent('After')
      editor.commands.selectAll()
      editor.commands.setBold()
      const document = { version: 2, content: editor.getJSON() }
      expect(document.content.content?.[0].content?.find(node => node.type === 'hardBreak')?.marks).toEqual([{ type: 'bold' }])
      expect(pageDocumentSchema.safeParse(document).success).toBe(true)
    } finally { editor.destroy() }
  })
  it('accepts installed Tiptap link defaults and bounded titles', () => {
    const editor = new Editor({ extensions: createPageExtensions(), content: { type: 'doc', content: [paragraph] } })
    try {
      editor.commands.selectAll()
      expect(editor.commands.setLink({ href: '/about' })).toBe(true)
      const content = editor.getJSON()
      expect(content.content?.[0].content?.[0].marks?.[0].attrs?.title).toBeNull()
      expect(pageDocumentSchema.safeParse({ version: 2, content }).success).toBe(true)
      expect(editor.commands.setLink({ href: '/about', title: 'More information' })).toBe(true)
      expect(editor.getJSON().content?.[0].content?.[0].marks?.[0].attrs?.title).toBe('More information')
      expect(pageDocumentSchema.safeParse(doc([{ type: 'paragraph', content: [{ type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: '/about', title: 'x'.repeat(1001) } }] }] }])).success).toBe(false)
    } finally { editor.destroy() }
  })
  it('upgrades v1 losslessly including empty paragraphs and documents', () => {
    expect(toPageEditorDocument({ version: 1, blocks: [{ type: 'paragraph', text: '' }, { type: 'paragraph', text: '<script>😀</script>' }] })).toEqual({ type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: '<script>😀</script>' }] }] })
    expect(toPageEditorDocument({ version: 1, blocks: [] })).toEqual({ type: 'doc', content: [] })
  })
  it('preserves bounded nested layouts and rich text', () => {
    const value = doc([{ type: 'section', attrs: { width: 'full', background: 'accent' }, content: [{ type: 'columns', content: [{ type: 'column', content: [paragraph] }, { type: 'column', content: [{ type: 'button', attrs: { label: 'Read', href: '/about', variant: 'outline', align: 'center' } }] }] }] }])
    expect(pageDocumentSchema.parse(value)).toEqual(value)
  })
  it.each([
    [{ type: 'column', content: [paragraph] }],
    [{ type: 'columns', content: [{ type: 'column', content: [paragraph] }] }],
    [{ type: 'paragraph', content: [{ type: 'section' }] }],
    [{ type: 'section', attrs: { style: 'color:red' } }],
    [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }],
    [{ type: 'image', attrs: { src: 'https://user:pass@example.test/a.png' } }],
    [{ type: 'heading', attrs: { level: 7 } }],
    [{ type: 'listItem', content: [paragraph] }],
  ])('rejects malformed structure or unsafe attributes', (...content) => {
    expect(pageDocumentSchema.safeParse(doc(content)).success).toBe(false)
  })
  it('accepts Tiptap default attributes', () => {
    expect(pageDocumentSchema.safeParse(doc([{ type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [paragraph] }] }, { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'const x = 1' }] }, { type: 'image', attrs: { src: '/image.png', alt: null, title: null, width: null, height: null, assetId: null } }])).success).toBe(true)
  })
  it('rejects deep, cyclic, excessive node and byte payloads without recursion failures', () => {
    let nested: unknown = paragraph
    for (let i = 0; i < 13; i++) nested = { type: 'section', content: [nested] }
    const cyclic: { type: string; content: unknown[] } = { type: 'section', content: [] }
    cyclic.content.push(cyclic)
    for (const value of [doc([nested]), doc([cyclic]), doc(Array.from({ length: 1500 }, () => ({ type: 'paragraph' }))), doc(Array.from({ length: 30 }, () => ({ type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(10000) }] })))]) {
      expect(pageDocumentSchema.safeParse(value).success).toBe(false)
    }
  })
})

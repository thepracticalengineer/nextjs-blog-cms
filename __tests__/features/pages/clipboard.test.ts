import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { createPageExtensions } from '@/features/pages/editor/extensions'

let editor: Editor
const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }
function create() {
  editor = new Editor({ extensions: createPageExtensions(), content: { type: 'doc', content: [paragraph] } })
}
function paste(html: string) { editor.view.pasteHTML(html, new Event('paste') as ClipboardEvent) }
afterEach(() => editor?.destroy())

describe('page clipboard', () => {
  it('preserves nested buttons through the actual clipboard serializer and paste parser', () => {
    create()
    editor.commands.setContent({ type: 'doc', content: [{ type: 'section', content: [{ type: 'columns', attrs: { preset: 'one' }, content: [{ type: 'column', content: [{ type: 'button', attrs: { label: 'Read more', href: '/about', variant: 'outline', align: 'right' } }] }] }] }] })
    const before = editor.getJSON()
    editor.commands.setNodeSelection(0)
    const { dom } = editor.view.serializeForClipboard(editor.state.selection.content())
    editor.commands.deleteSelection()
    paste(dom.innerHTML)
    expect(editor.getJSON()).toEqual(before)
  })
  it('leaves ordinary links as rich text and rejects unsafe button destinations', () => {
    create()
    editor.commands.selectAll()
    paste('<p><a href="/about">About</a></p>')
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: 'paragraph', content: [{ type: 'text', text: 'About', marks: [{ type: 'link', attrs: { href: '/about' } }] }] })
    const before = editor.getJSON()
    editor.commands.selectAll()
    paste('<div data-page-block="button"><a href="javascript:alert(1)">Bad</a></div>')
    expect(editor.getJSON()).toEqual(before)
  })
  it('normalizes website link, list and image attributes without discarding content', () => {
    create()
    editor.commands.selectAll()
    paste('<p><a href="https://example.test/" class="external" rel="ugc noopener" target="_top">Pasted link</a></p><ol type="a" start="0"><li><p>First item</p></li></ol><img src="/diagram.png" alt="Diagram" width="100%" height="-4">')
    expect(editor.getJSON().content).toMatchObject([
      { type: 'paragraph', content: [{ type: 'text', text: 'Pasted link', marks: [{ type: 'link', attrs: { href: 'https://example.test/', class: null, rel: 'noopener noreferrer', target: null } }] }] },
      { type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ text: 'First item' }] }] }] },
      { type: 'image', attrs: { src: '/diagram.png', width: null, height: null } },
    ])
  })
  it('preserves bounded list starts, image dimensions and safe new-tab links', () => {
    create()
    editor.commands.selectAll()
    paste('<p><a href="/about" target="_blank" rel="ugc nofollow">About</a></p><ol start="5"><li><p>Fifth</p></li></ol><img src="/diagram.png" width="800" height="600">')
    expect(editor.getJSON().content).toMatchObject([
      { content: [{ marks: [{ attrs: { target: '_blank', rel: 'noopener noreferrer nofollow' } }] }] },
      { attrs: { start: 5 } }, { attrs: { width: 800, height: 600 } },
    ])
  })
})

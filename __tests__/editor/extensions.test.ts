import { describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { extensions } from '@/components/editor/extensions'

// Representative persisted v2 content. v3 must preserve its schema and styling.
const savedHtml = `
<h2 style="text-align: center; line-height: 1.8">Saved heading</h2>
<p><strong>Bold</strong> <em>italic</em> <u>underlined</u> <s>strike</s>
<a href="https://example.com/article">link</a> <span style="color: #ff0000">color</span>
<mark data-color="#ffff00" style="background-color: #ffff00">highlight</mark>
<sub>sub</sub><sup>sup</sup><code>code</code></p>
<ul><li><p>Bullet</p></li></ul><ol><li><p>Numbered</p></li></ol>
<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><div><p>Done</p></div></li></ul>
<table><tbody><tr><th><p>Header</p></th><td><p>Cell</p></td></tr></tbody></table>
<img src="https://example.com/image.png" alt="Saved image" />`

describe('TipTap v3 compatibility', () => {
  it('loads saved HTML, saves JSON and reloads without losing formatting or nodes', () => {
    const editor = new Editor({ extensions, content: savedHtml })
    const reloaded = new Editor({ extensions, content: editor.getJSON() })
    try {
      expect(reloaded.getJSON()).toEqual(editor.getJSON())
      const html = reloaded.getHTML()
      for (const text of ['Saved heading', 'Bold', 'italic', 'underlined', 'strike', 'link', 'color', 'highlight', 'Bullet', 'Numbered', 'Done', 'Header', 'Cell', 'Saved image']) {
        expect(html).toContain(text)
      }
      expect(html).toContain('line-height: 1.8')
      expect(html).toContain('text-align: center')
      expect(html).toContain('href="https://example.com/article"')
      expect(html).toContain('data-checked="true"')
      expect(html).toContain('<table')
      expect(html).toContain('<sub>')
      expect(html).toContain('<sup>')
      expect(html).toContain('<u>')
      expect(editor.extensionManager.extensions.map((extension) => extension.name)).toEqual(
        [...new Set(editor.extensionManager.extensions.map((extension) => extension.name))]
      )
    } finally {
      editor.destroy()
      reloaded.destroy()
    }
  })

  it('replaces external content without emitting an update and supports clearing', () => {
    const onUpdate = vi.fn()
    const editor = new Editor({ extensions, content: savedHtml, onUpdate })
    try {
      editor.commands.setContent('<p>Replacement</p>', { emitUpdate: false })
      expect(editor.getText()).toBe('Replacement')
      editor.commands.setContent('', { emitUpdate: false })
      expect(editor.isEmpty).toBe(true)
      expect(onUpdate).not.toHaveBeenCalled()
      editor.commands.insertContent('New edit')
      expect(onUpdate).toHaveBeenCalledOnce()
    } finally {
      editor.destroy()
    }
  })
})

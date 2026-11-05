import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { createPageExtensions } from '@/features/pages/editor/extensions'
import { pageDocumentSchema, pageValuesSchema } from '@/features/pages/schema'
import { isBlankPageDocument, starterLayoutDocument, starterLayouts } from '@/features/pages/starters'
import { hasPagePlaceholders } from '@/features/pages/placeholders'
import { pageReadiness } from '@/features/pages/readiness'
import type { PageNode } from '@/features/pages/document'

let editor: Editor | undefined
afterEach(() => { editor?.destroy(); editor = undefined })

function headings(node: PageNode, levels: number[] = []): number[] {
  if (node.type === 'heading') levels.push(node.attrs!.level as number)
  node.content?.forEach(child => headings(child as PageNode, levels))
  return levels
}

describe('starter layouts', () => {
  it.each(starterLayouts.map(layout => [layout.id, layout] as const))('%s is a valid, accessible draft document', (_id, layout) => {
    expect(pageDocumentSchema.safeParse(layout.document).success).toBe(true)
    expect(pageValuesSchema.safeParse({ title: layout.title, slug: layout.slug, seo_title: '', seo_description: '', document: layout.document }).success).toBe(true)
    // The page title is the public h1: layouts start at h2 and never skip a level.
    const levels = headings(layout.document.content)
    expect(levels[0]).toBe(2)
    levels.forEach((level, index) => { if (index) expect(level - levels[index - 1]).toBeLessThanOrEqual(1) })
    expect(levels.every(level => level >= 2)).toBe(true)
  })
  it.each(starterLayouts.map(layout => [layout.id, layout] as const))('%s round-trips through the page editor schema unchanged', (_id, layout) => {
    editor = new Editor({ extensions: createPageExtensions(), content: layout.document.content })
    const reloaded = { version: 2 as const, content: editor.getJSON() }
    expect(pageDocumentSchema.safeParse(reloaded).success).toBe(true)
    // Editor serialization adds default attributes only; text and structure are preserved.
    expect(editor.state.doc.textContent).toBe(editor.schema.nodeFromJSON(layout.document.content).textContent)
    editor.commands.setContent(reloaded.content)
    expect(editor.getJSON()).toEqual(reloaded.content)
  })
  it('cannot be published while placeholders remain', () => {
    for (const layout of starterLayouts) {
      expect(hasPagePlaceholders(layout.document)).toBe(true)
      expect(pageReadiness({ title: layout.title, slug: layout.slug, seo_title: '', seo_description: '', document: layout.document }).join(' ')).toMatch(/placeholders/)
    }
  })
  it('detects placeholder text, labels and destinations, case-insensitively', () => {
    const doc = (...content: PageNode[]) => ({ version: 2 as const, content: { type: 'doc', content } })
    expect(hasPagePlaceholders(doc({ type: 'paragraph', content: [{ type: 'text', text: 'Hello [[REPLACE: name]]' }] }))).toBe(true)
    expect(hasPagePlaceholders(doc({ type: 'button', attrs: { label: 'Go', href: '#Replace-Link' } }))).toBe(true)
    expect(hasPagePlaceholders(doc({ type: 'paragraph', content: [{ type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: '#replace-link' } }] }] }))).toBe(true)
    expect(hasPagePlaceholders(doc({ type: 'paragraph', content: [{ type: 'text', text: 'Replace your old site' }] }), )).toBe(false)
    expect(hasPagePlaceholders(doc({ type: 'button', attrs: { label: 'Contact', href: '/contact' } }))).toBe(false)
    expect(hasPagePlaceholders({ version: 1, blocks: [{ type: 'paragraph', text: '[[replace]]' }] })).toBe(true)
  })
  it('returns independent copies', () => {
    const copy = starterLayoutDocument('about')
    copy.content.content![0].content![0].content![0].text = 'Changed'
    expect(starterLayoutDocument('about')).not.toEqual(copy)
    expect(starterLayouts[0].document.content.content![0].content![0].content![0].text).toMatch(/Replace/)
  })
  it('only treats content-free documents as blank', () => {
    expect(isBlankPageDocument({ version: 1, blocks: [] })).toBe(true)
    expect(isBlankPageDocument({ version: 2, content: { type: 'doc', content: [{ type: 'section', content: [{ type: 'paragraph' }] }] } })).toBe(true)
    expect(isBlankPageDocument({ version: 2, content: { type: 'doc', content: [{ type: 'button', attrs: { label: 'Go', href: '/' } }] } })).toBe(false)
    expect(isBlankPageDocument(starterLayoutDocument('contact'))).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { compareRevision, diffLines, documentLines } from '@/features/pages/revisions'
import type { PageValues } from '@/features/pages/schema'
import type { PageDocumentV2, PageNode } from '@/features/pages/document'

const paragraph = (text: string): PageNode => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const doc = (...content: PageNode[]): PageDocumentV2 => ({ version: 2, content: { type: 'doc', content } })
const base: PageValues = { title: 'About', slug: 'about', seo_title: '', seo_description: '', document: doc(paragraph('One'), paragraph('Two')) }

describe('revision comparison', () => {
  it('extracts readable lines from nested layouts, images and buttons', () => {
    const nested = doc({ type: 'section', content: [{ type: 'columns', content: [{ type: 'column', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
      { type: 'image', attrs: { src: '/a.png', alt: 'Team' } },
      { type: 'button', attrs: { label: 'Go', href: '/go' } },
    ] }] }] })
    expect(documentLines(nested)).toEqual(['## Title', '[Image: Team]', '[Button: Go → /go]'])
    expect(documentLines({ version: 1, blocks: [{ type: 'paragraph', text: ' Legacy ' }, { type: 'paragraph', text: '' }] })).toEqual(['Legacy'])
  })
  it('orders added and removed lines around unchanged ones', () => {
    expect(diffLines(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([
      { kind: 'same', text: 'a' }, { kind: 'removed', text: 'b' }, { kind: 'added', text: 'x' }, { kind: 'same', text: 'c' },
    ])
  })
  it('reports settings changes and text changes separately from layout-only changes', () => {
    const target = { ...base, slug: 'about-us', document: doc(paragraph('One'), paragraph('Three')) }
    const result = compareRevision(base, target)
    expect(result.fields).toEqual([{ field: 'slug', before: 'about', after: 'about-us' }])
    expect(result.contentChanged).toBe(true)
    expect(result.layoutOnly).toBe(false)
    const layout = compareRevision(base, { ...base, document: doc({ type: 'section', attrs: { width: 'full' }, content: [paragraph('One'), paragraph('Two')] }) })
    expect(layout).toMatchObject({ fields: [], contentChanged: true, layoutOnly: true })
    expect(compareRevision(base, base)).toMatchObject({ fields: [], contentChanged: false, layoutOnly: false })
  })
  it('stays bounded for very large documents', () => {
    const before = Array.from({ length: 1000 }, (_, i) => `line ${i}`)
    const after = [...before.slice(1), 'new']
    const result = diffLines(before, after)
    expect(result.filter(line => line.kind === 'removed').map(line => line.text)).toEqual(['line 0'])
    expect(result.filter(line => line.kind === 'added').map(line => line.text)).toEqual(['new'])
  })
})

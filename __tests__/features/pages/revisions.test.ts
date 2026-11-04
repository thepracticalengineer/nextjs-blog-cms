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
    expect(diffLines(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual({ exact: true, lines: [
      { kind: 'same', text: 'a' }, { kind: 'removed', text: 'b' }, { kind: 'added', text: 'x' }, { kind: 'same', text: 'c' },
    ] })
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
  it('stays exact for large documents with a small changed region', () => {
    const before = Array.from({ length: 1000 }, (_, i) => `line ${i}`)
    const after = before.with(500, 'new')
    const result = diffLines(before, after)
    expect(result.exact).toBe(true)
    expect(result.lines.filter(line => line.kind === 'removed').map(line => line.text)).toEqual(['line 500'])
    expect(result.lines.filter(line => line.kind === 'added').map(line => line.text)).toEqual(['new'])
  })
  it('counts repeated lines when a large change falls back to an approximate diff', () => {
    const before = Array.from({ length: 1001 }, (_, i) => i % 2 ? 'same' : `old ${i}`)
    const after = Array.from({ length: 1000 }, (_, i) => i % 2 ? 'same' : `new ${i}`)
    const result = diffLines(before, after)
    expect(result.exact).toBe(false)
    const count = (kind: string, text?: string) => result.lines.filter(line => line.kind === kind && (!text || line.text === text)).length
    expect(count('removed', 'same')).toBe(0)
    expect(count('removed')).toBe(501)
    expect(count('added')).toBe(500)
    expect(count('same')).toBe(500)
  })
  it('never reports a large repeated-line text change as layout-only', () => {
    const lines = (n: number) => doc(...Array.from({ length: n }, (_, i) => paragraph(i % 3 ? 'same' : `unique ${i}`)))
    const removedOne = compareRevision({ ...base, document: lines(1500) }, { ...base, document: doc(paragraph('lead'), ...(lines(1499).content.content ?? [])) })
    expect(removedOne.layoutOnly).toBe(false)
    const repeated = compareRevision({ ...base, document: doc(...Array.from({ length: 501 }, () => paragraph('same'))) }, { ...base, document: doc(...Array.from({ length: 500 }, () => paragraph('same'))) })
    expect(repeated).toMatchObject({ layoutOnly: false, exact: true })
    expect(repeated.lines.filter(line => line.kind === 'removed')).toHaveLength(1)
  })
})

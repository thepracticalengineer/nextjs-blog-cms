import { describe, expect, it } from 'vitest'
import { pageDocumentSchema, pageValuesSchema, pageWriteSchema } from '@/features/pages/schema'
import { can } from '@/lib/permissions'

const document = { version: 1, blocks: [{ type: 'paragraph', text: 'Hello <script>plain text</script>' }] }
const values = { title: 'About', slug: 'about', seo_title: '', seo_description: '', document }
describe('page contracts', () => {
  it('accepts a versioned plain-text document and empty drafts', () => {
    expect(pageDocumentSchema.parse(document)).toEqual(document)
    expect(pageDocumentSchema.safeParse({ version: 1, blocks: [] }).success).toBe(true)
    expect(pageValuesSchema.parse(values)).toEqual(values)
  })
  it.each([null, {}, { version: 2, blocks: [] }, { version: 1, blocks: [{ type: 'html', html: '<b>x</b>' }] },
    { version: 1, blocks: [], hidden: true }, { version: 1, blocks: [{ type: 'paragraph', text: 42 }] },
    { version: 1, blocks: Array.from({ length: 501 }, () => ({ type: 'paragraph', text: '' })) }])('rejects malformed or unsupported documents: %j', input => {
    expect(pageDocumentSchema.safeParse(input).success).toBe(false)
  })
  it.each(['', 'Upper', '../about', 'about/us', 'about--us', 'a'.repeat(121)])('rejects invalid slugs: %s', slug => {
    expect(pageValuesSchema.safeParse({ ...values, slug }).success).toBe(false)
  })
  it('uses Unicode character limits consistently with PostgreSQL', () => {
    expect(pageValuesSchema.safeParse({ ...values, title: '😀'.repeat(200) }).success).toBe(true)
    expect(pageValuesSchema.safeParse({ ...values, title: '😀'.repeat(201) }).success).toBe(false)
    for (const title of ['\n', '\t', '\u00a0', '\u2003', '\ufeff']) {
      expect(pageValuesSchema.safeParse({ ...values, title }).success).toBe(false)
    }
    expect(pageDocumentSchema.safeParse({ version: 1, blocks: [{ type: 'paragraph', text: '😀'.repeat(10000) }] }).success).toBe(true)
  })
  it('rejects text PostgreSQL cannot represent', () => {
    for (const title of ['bad\u0000text', 'bad\ud800text']) {
      expect(pageValuesSchema.safeParse({ ...values, title }).success).toBe(false)
    }
  })
  it('requires retry identity and exact revisions for mutations', () => {
    expect(pageWriteSchema.safeParse({ operation: 'create', values, requestKey: 'a' }).success).toBe(true)
    expect(pageWriteSchema.safeParse({ operation: 'create', values }).success).toBe(false)
    expect(pageWriteSchema.safeParse({ operation: 'save', values, requestKey: 'a', pageId: crypto.randomUUID() }).success).toBe(false)
    expect(pageWriteSchema.safeParse({ operation: 'publish', reviewed: true, requestKey: 'a', pageId: crypto.randomUUID(), expectedRevision: crypto.randomUUID() }).success).toBe(true)
  })
  it('keeps all page capabilities admin-only without changing author publishing', () => {
    for (const permission of ['pages:create', 'pages:read', 'pages:update', 'pages:publish'] as const) {
      expect(can('admin', permission)).toBe(true)
      expect(can('author', permission)).toBe(false)
      expect(can(null, permission)).toBe(false)
    }
    expect(can('author', 'posts:publish')).toBe(true)
  })
})

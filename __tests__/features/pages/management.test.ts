import { beforeEach, describe, expect, it } from 'vitest'
import { pageReadiness } from '@/features/pages/readiness'
import { pageWriteSchema, type PageValues } from '@/features/pages/schema'
import { readPageRecovery, recoveryKey, type PageRecovery } from '@/features/pages/management/recovery'
const id = '28800000-0000-4000-8000-000000000001'
const values: PageValues = { title: 'About', slug: 'about', seo_title: '', seo_description: '', document: { version: 1, blocks: [{ type: 'paragraph', text: 'Hello' }] } }
describe('page publication readiness', () => {
  it('accepts short informational content and optional SEO without article requirements', () => expect(pageReadiness(values)).toEqual([]))
  it('rejects empty and whitespace-only layouts', () => {
    expect(pageReadiness({ ...values, document: { version: 1, blocks: [{ type: 'paragraph', text: '\u00a0\n' }] } })).toContain('Add meaningful text or an image before publishing.')
    expect(pageReadiness({ ...values, document: { version: 2, content: { type: 'doc', content: [{ type: 'horizontalRule' }] } } })).toHaveLength(1)
  })
  it('requires alt text on every nested image and accepts accessible image-only pages', () => {
    const document = { version: 2 as const, content: { type: 'doc', content: [{ type: 'section', content: [{ type: 'image', attrs: { src: '/photo.png', alt: '' } }] }] } }
    expect(pageReadiness({ ...values, document })).toContain('Add alternative text to every page image before publishing.')
    document.content.content[0].content[0].attrs.alt = 'The workshop'
    expect(pageReadiness({ ...values, document })).toEqual([])
  })
  it('requires explicit true review on publication only', () => {
    const request = { operation: 'publish', requestKey: id, pageId: id, expectedRevision: id }
    expect(pageWriteSchema.safeParse(request).success).toBe(false)
    expect(pageWriteSchema.safeParse({ ...request, reviewed: false }).success).toBe(false)
    expect(pageWriteSchema.safeParse({ ...request, reviewed: true }).success).toBe(true)
  })
})
describe('private browser recovery', () => {
  beforeEach(() => localStorage.clear())
  it('preserves incomplete input and exact pending create requests, scoped by account and document', () => {
    const record: PageRecovery = { version: 1, reconcile: false, accountId: id, documentId: id, writerId: id, updatedAt: 1, page: null, values: { ...values, title: '', slug: '' }, pending: { operation: 'create', requestKey: 'stable-key', values } }
    localStorage.setItem(recoveryKey(record), JSON.stringify(record))
    localStorage.setItem(`page-recovery:v1:${id}:malformed`, '{')
    expect(readPageRecovery(id, id)).toEqual([record])
    expect(readPageRecovery('28800000-0000-4000-8000-000000000002')).toEqual([])
    expect(readPageRecovery(id, '28800000-0000-4000-8000-000000000002')).toEqual([])
    localStorage.setItem(recoveryKey(record), JSON.stringify({ ...record, accountId: '28800000-0000-4000-8000-000000000002' }))
    expect(readPageRecovery(id)).toEqual([])
  })
  it('keeps separate writers so tabs cannot overwrite each other', () => {
    for (const suffix of ['1', '2']) {
      const record: PageRecovery = { version: 1, reconcile: false, accountId: id, documentId: id, writerId: `28800000-0000-4000-8000-00000000000${suffix}`, updatedAt: Number(suffix), page: null, values, pending: null }
      localStorage.setItem(recoveryKey(record), JSON.stringify(record))
    }
    expect(readPageRecovery(id)).toHaveLength(2)
    expect(readPageRecovery(id)[0].updatedAt).toBe(2)
  })
})

it('retains pre-upgrade recovery with a pending reserved-slug write for exact reconciliation', () => {
  localStorage.clear()
  const legacy = { ...values, slug: 'blog' }
  const record: PageRecovery = { version: 1, reconcile: false, accountId: id, documentId: id, writerId: id, updatedAt: 1, page: null, values: legacy, pending: { operation: 'create', requestKey: 'pre-upgrade', values: legacy } }
  localStorage.setItem(recoveryKey(record), JSON.stringify(record))
  expect(readPageRecovery(id, id)).toEqual([record])
})

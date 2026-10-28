import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), client: vi.fn(), publicClient: vi.fn(), rpc: vi.fn(), from: vi.fn(), maybeSingle: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({ authorizeSession: mocks.authorize }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
vi.mock('@/lib/supabase/static', () => ({ createStaticClient: mocks.publicClient }))
import { writePage, getPage } from '@/features/pages/actions'
import { getPublishedPage } from '@/features/pages/queries'
const id = '28600000-0000-4000-8000-000000000001'
const values = { title: 'About', slug: 'about', seo_title: '', seo_description: '', document: { version: 1, blocks: [] } }
const row = { ...values, id, status: 'draft', revision: id, created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:00Z', created_by: id, updated_by: id, published_at: null, published_by: null }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.authorize.mockResolvedValue({ profile: { id, role: 'admin' }, failure: null })
  mocks.client.mockResolvedValue({ rpc: mocks.rpc, from: mocks.from })
  mocks.publicClient.mockReturnValue({ from: mocks.from })
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) })
  mocks.rpc.mockResolvedValue({ data: { page: row, replayed: false }, error: null })
  mocks.maybeSingle.mockResolvedValue({ data: row, error: null })
})
describe('page actions', () => {
  it.each(['UNAUTHENTICATED', 'FORBIDDEN', 'MFA_REQUIRED', 'AUTH_UNAVAILABLE'])('denies %s before database access', async code => {
    mocks.authorize.mockResolvedValue({ profile: null, failure: { code, error: 'Denied' } })
    expect((await writePage({ operation: 'create', requestKey: 'key', values })).error?.code).toBe(code)
    expect((await getPage(id)).error?.code).toBe(code)
    expect(mocks.client).not.toHaveBeenCalled()
  })
  it.each(['create', 'save', 'publish', 'unpublish'] as const)('checks the %s capability and uses caller RPC', async operation => {
    const input = operation === 'create' ? { operation, requestKey: 'key', values } :
      { operation, requestKey: 'key', pageId: id, expectedRevision: id, ...(operation === 'save' ? { values } : {}) }
    expect((await writePage(input)).data?.page).toEqual(row)
    expect(mocks.authorize).toHaveBeenCalledWith(operation === 'create' ? 'pages:create' : operation === 'save' ? 'pages:update' : 'pages:publish')
    expect(mocks.rpc).toHaveBeenCalledWith('write_page_atomic', {
      p_operation: operation, p_request_key: 'key', p_values: ['create', 'save'].includes(operation) ? values : null,
      p_page_id: operation === 'create' ? null : id, p_expected_revision: operation === 'create' ? null : id,
    })
  })
  it('rejects invalid inputs without persistence', async () => {
    expect((await writePage({ operation: 'create', requestKey: 'key', values: { ...values, document: { version: 99, blocks: [] } } })).error?.code).toBe('PAGE_INVALID_INPUT')
    expect((await getPage('invalid')).error?.code).toBe('PAGE_INVALID_INPUT')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each(['PAGE_STALE', 'PAGE_RETRY_CONFLICT', 'PAGE_SLUG_CONFLICT', 'PAGE_FORBIDDEN', 'PAGE_NOT_FOUND', 'PAGE_INVALID_DOCUMENT'])('reports %s without leaking SQL', async code => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: code } })
    expect((await writePage({ operation: 'create', requestKey: 'key', values })).error?.code).toBe(code)
  })
  it('handles outages, empty RPC responses and unknown SQL errors', async () => {
    for (const response of [{ data: null, error: null }, { data: null, error: { message: 'secret SQL' } }]) {
      mocks.rpc.mockResolvedValue(response)
      expect((await writePage({ operation: 'create', requestKey: 'key', values })).error?.code).toBe('PAGE_UNAVAILABLE')
    }
    mocks.rpc.mockRejectedValue(new Error('secret SQL'))
    expect((await writePage({ operation: 'create', requestKey: 'key', values })).error?.code).toBe('PAGE_UNAVAILABLE')
  })
  it('refuses unsupported stored documents at private and public read boundaries', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...row, document: { version: 2, blocks: [] } }, error: null })
    expect((await getPage(id)).error?.code).toBe('PAGE_UNSUPPORTED_DOCUMENT')
    expect((await getPublishedPage('about')).error?.code).toBe('PAGE_UNSUPPORTED_DOCUMENT')
    expect(mocks.from.mock.calls.map(call => call[0])).toEqual(['pages', 'page_snapshots'])
  })
  it('reads public snapshots without a cookie/session client', async () => {
    mocks.client.mockRejectedValue(new Error('cookies unavailable during static generation'))
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await getPublishedPage('about')).toEqual({ data: null, error: null })
    expect(mocks.publicClient).toHaveBeenCalledOnce()
    expect(mocks.client).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it('reports unavailable public client configuration', async () => {
    mocks.publicClient.mockReturnValue(null)
    expect((await getPublishedPage('about')).error?.code).toBe('PAGE_UNAVAILABLE')
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('reads only the public snapshot and returns no draft fallback on absence/errors', async () => {
    const { title, slug, seo_title, seo_description, document } = values
    const snapshot = { title, slug, seo_title, seo_description, document, page_id: id, revision: id, published_at: row.created_at }
    mocks.maybeSingle.mockResolvedValue({ data: snapshot, error: null })
    expect((await getPublishedPage('about')).data).toEqual(snapshot)
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect((await getPublishedPage('about')).data).toBeNull()
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'secret' } })
    expect((await getPublishedPage('about')).error?.code).toBe('PAGE_UNAVAILABLE')
    expect(mocks.from.mock.calls.every(call => call[0] === 'page_snapshots')).toBe(true)
  })
})

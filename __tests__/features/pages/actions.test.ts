import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), client: vi.fn(), publicClient: vi.fn(), rpc: vi.fn(), from: vi.fn(), maybeSingle: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({ authorizeSession: mocks.authorize }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
vi.mock('@/lib/supabase/static', () => ({ createStaticClient: mocks.publicClient }))
import { revalidatePath } from 'next/cache'
import { writePage, getPage, getPageRevision, listPageRevisions, listPageTree } from '@/features/pages/actions'
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
      { operation, requestKey: 'key', pageId: id, expectedRevision: id, ...(operation === 'publish' ? { reviewed: true } : {}), ...(operation === 'save' ? { values } : {}) }
    expect((await writePage(input)).data?.page).toEqual(row)
    expect(mocks.authorize).toHaveBeenCalledWith(operation === 'create' ? 'pages:create' : operation === 'save' ? 'pages:update' : 'pages:publish')
    expect(mocks.rpc).toHaveBeenCalledWith('write_page_atomic', {
      p_operation: operation, p_confirm_url_change: false, p_reviewed: operation === 'publish', p_request_key: 'key', p_values: ['create', 'save'].includes(operation) ? values : null,
      p_page_id: operation === 'create' ? null : id, p_expected_revision: operation === 'create' ? null : id, p_source_revision: null, p_options: null,
    })
  })
  it('enforces configured image hosts at writes and both stored read boundaries', async () => {
    const document = { version: 2, content: { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://unconfigured.invalid/image.png' } }] } }
    expect((await writePage({ operation: 'create', requestKey: 'image', values: { ...values, document } })).error).toMatchObject({ code: 'PAGE_IMAGE_NOT_ALLOWED', image: { src: 'https://unconfigured.invalid/image.png', path: [0] } })
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.maybeSingle.mockResolvedValue({ data: { ...row, document }, error: null })
    expect((await getPage(id)).error).toMatchObject({ code: 'PAGE_IMAGE_NOT_ALLOWED', image: { path: [0] } })
    mocks.maybeSingle.mockResolvedValue({ data: { ...values, document, page_id: id, revision: id, published_at: row.created_at }, error: null })
    expect((await getPublishedPage('about')).error?.code).toBe('PAGE_UNSUPPORTED_DOCUMENT')
    mocks.maybeSingle.mockResolvedValue({ data: { ...row, document }, error: null })
    mocks.rpc.mockResolvedValue({ data: { page: { ...row, document }, replayed: true }, error: null })
    expect((await writePage({ operation: 'publish', reviewed: true, requestKey: 'old-publish', pageId: id, expectedRevision: id })).error?.code).toBe('PAGE_IMAGE_NOT_ALLOWED')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('identifies the first disallowed nested image only after authorization', async () => {
    const document = { version: 2, content: { type: 'doc', content: [{ type: 'section', content: [{ type: 'image', attrs: { src: '/allowed.png' } }, { type: 'image', attrs: { src: 'https://blocked.invalid/first.png' } }, { type: 'image', attrs: { src: 'https://blocked.invalid/second.png' } }] }] } }
    const input = { operation: 'save', requestKey: 'image-save', pageId: id, expectedRevision: id, values: { ...values, document } }
    expect((await writePage(input)).error).toMatchObject({ code: 'PAGE_IMAGE_NOT_ALLOWED', image: { src: 'https://blocked.invalid/first.png', path: [0, 1] } })
    expect(mocks.client).not.toHaveBeenCalled()
    mocks.authorize.mockResolvedValue({ profile: null, failure: { code: 'FORBIDDEN', error: 'Denied' } })
    expect((await writePage(input)).error).toEqual({ code: 'FORBIDDEN', message: 'Denied', writeAttempted: false })
  })
  it('accepts relative image paths and configured remote hosts on the server', async () => {
    vi.stubEnv('IMAGE_REMOTE_HOSTS', 'images.example.test')
    try {
      for (const src of ['/image.png', 'https://images.example.test/image.png']) {
        const document = { version: 2, content: { type: 'doc', content: [{ type: 'image', attrs: { src } }] } }
        mocks.rpc.mockResolvedValue({ data: { page: { ...row, document }, replayed: false }, error: null })
        expect((await writePage({ operation: 'create', requestKey: src, values: { ...values, document } })).error).toBeNull()
      }
    } finally { vi.unstubAllEnvs() }
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

it('pins management mutations to the account that opened the editor', async () => {
  expect((await writePage({ operation: 'create', requestKey: 'account-switch', values }, '28800000-0000-4000-8000-000000000002')).error?.code).toBe('PAGE_FORBIDDEN')
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it('distinguishes image input rejection from a blocked committed/replayed result', async () => {
  const document = { version: 2, content: { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://blocked.invalid/image.png' } }] } }
  const rejected = await writePage({ operation: 'create', requestKey: 'invalid-image', values: { ...values, document } })
  expect(rejected.error).toMatchObject({ code: 'PAGE_IMAGE_NOT_ALLOWED', writeAttempted: false })
  expect(mocks.rpc).not.toHaveBeenCalled()
  mocks.rpc.mockResolvedValue({ data: { page: { ...row, document }, replayed: true }, error: null })
  const committed = await writePage({ operation: 'create', requestKey: 'old-create', values })
  expect(committed.error?.code).toBe('PAGE_IMAGE_NOT_ALLOWED')
  expect(committed.error).not.toHaveProperty('writeAttempted')
})
it('authorizes publication once before checking the deployment image policy', async () => {
  await writePage({ operation: 'publish', reviewed: true, requestKey: 'reviewed', pageId: id, expectedRevision: id })
  expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith('pages:publish')
})

it('invalidates all public aliases and sitemap only for publication operations, including retries', async () => {
  mocks.rpc.mockResolvedValue({ data: { page: row, replayed: true }, error: null })
  for (const operation of ['publish', 'unpublish'] as const) {
    vi.mocked(revalidatePath).mockClear()
    await writePage({ operation, requestKey: 'invalidation', pageId: id, expectedRevision: id, ...(operation === 'publish' ? { reviewed: true, confirmUrlChange: true } : {}) })
    expect(revalidatePath).toHaveBeenCalledWith('/[slug]', 'page')
    expect(revalidatePath).toHaveBeenCalledWith('/sitemap.xml')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/pages')
  }
  vi.mocked(revalidatePath).mockClear()
  await writePage({ operation: 'save', requestKey: 'draft', pageId: id, expectedRevision: id, values })
  expect(revalidatePath).toHaveBeenCalledTimes(1)
  expect(revalidatePath).toHaveBeenCalledWith('/dashboard/pages')
})

it('lets SQL reconcile historical reserved-slug requests before enforcing new claims', async () => {
  const legacy = { ...values, slug: 'blog' }
  mocks.rpc.mockResolvedValueOnce({ data: { page: { ...row, ...legacy }, replayed: true }, error: null })
  expect((await writePage({ operation: 'create', requestKey: 'pre-upgrade', values: legacy })).data?.replayed).toBe(true)
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'PAGE_RESERVED_URL' } })
  expect((await writePage({ operation: 'create', requestKey: 'new-claim', values: legacy })).error?.code).toBe('PAGE_RESERVED_URL')
})

describe('page revisions', () => {
  const source = '29000000-0000-4000-8000-000000000009'
  const revisionRow = { ...values, id: source, page_id: id, revision: source, operation: 'save', status: 'draft', restored_from: null, created_by: id, created_at: row.created_at }
  const summary = { id: source, revision: source, operation: 'save', title: 'About', slug: 'about', status: 'draft', restored_from: null, created_by: id, author_name: 'Admin', created_at: row.created_at }
  const revisionQuery = vi.fn()
  beforeEach(() => {
    revisionQuery.mockResolvedValue({ data: revisionRow, error: null })
    mocks.from.mockImplementation((table: string) => table === 'page_revisions'
      ? { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: revisionQuery }) }) }) }
      : { select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) })
  })
  const restore = { operation: 'restore', requestKey: 'restore', pageId: id, expectedRevision: id, sourceRevision: source } as const
  it('restores through the caller RPC with update capability and dashboard-only invalidation', async () => {
    expect((await writePage(restore)).data?.page).toEqual(row)
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith('pages:update')
    expect(mocks.rpc).toHaveBeenCalledWith('write_page_atomic', expect.objectContaining({ p_operation: 'restore', p_values: null, p_reviewed: false, p_source_revision: source }))
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith('/dashboard/pages')
  })
  it('rejects missing or disallowed revisions before writing', async () => {
    revisionQuery.mockResolvedValue({ data: null, error: null })
    expect((await writePage(restore)).error).toMatchObject({ code: 'PAGE_REVISION_NOT_FOUND', writeAttempted: false })
    const document = { version: 2, content: { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://blocked.invalid/old.png' } }] } }
    revisionQuery.mockResolvedValue({ data: { ...revisionRow, document }, error: null })
    expect((await writePage(restore)).error).toMatchObject({ code: 'PAGE_IMAGE_NOT_ALLOWED', writeAttempted: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('requires a source revision and refuses values for restore', async () => {
    expect((await writePage({ ...restore, sourceRevision: undefined })).error?.code).toBe('PAGE_INVALID_INPUT')
    expect((await writePage({ ...restore, values })).error?.code).toBe('PAGE_INVALID_INPUT')
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it('lists summaries through the private RPC and validates the response', async () => {
    mocks.rpc.mockResolvedValue({ data: [summary], error: null })
    expect((await listPageRevisions(id)).data).toEqual([summary])
    expect(mocks.authorize).toHaveBeenCalledWith('pages:read')
    expect(mocks.rpc).toHaveBeenCalledWith('list_page_revisions', { p_page_id: id, p_limit: 50 })
    mocks.rpc.mockResolvedValue({ data: [{ ...summary, operation: 'forged' }], error: null })
    expect((await listPageRevisions(id)).error?.code).toBe('PAGE_UNAVAILABLE')
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'PAGE_FORBIDDEN' } })
    expect((await listPageRevisions(id)).error?.code).toBe('PAGE_FORBIDDEN')
  })
  it('reads one revision scoped to its page', async () => {
    expect((await getPageRevision(id, source)).data).toEqual(revisionRow)
    revisionQuery.mockResolvedValue({ data: null, error: null })
    expect(await getPageRevision(id, source)).toEqual({ data: null, error: null })
    expect((await getPageRevision(id, 'invalid')).error?.code).toBe('PAGE_INVALID_INPUT')
  })
  it('denies history access before database access', async () => {
    mocks.authorize.mockResolvedValue({ profile: null, failure: { code: 'FORBIDDEN', error: 'Denied' } })
    expect((await listPageRevisions(id)).error?.code).toBe('FORBIDDEN')
    expect((await getPageRevision(id, source)).error?.code).toBe('FORBIDDEN')
    expect(mocks.client).not.toHaveBeenCalled()
  })
})

describe('trash and hierarchy writes', () => {
  const base = { requestKey: 'k', pageId: id, expectedRevision: id }
  it.each([
    ['trash', {}, 'pages:publish', null],
    ['recover', {}, 'pages:update', null],
    ['purge', { confirmSlug: 'about' }, 'pages:publish', { confirm_slug: 'about' }],
    ['move', { parentId: null, position: 2 }, 'pages:update', { parent_id: null, position: 2 }],
  ] as const)('%s checks its capability and passes options', async (operation, extra, permission, options) => {
    expect((await writePage({ operation, ...base, ...extra })).error).toBeNull()
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(permission)
    expect(mocks.rpc).toHaveBeenCalledWith('write_page_atomic', expect.objectContaining({ p_operation: operation, p_values: null, p_options: options }))
  })
  it('invalidates public routes when trashing or purging, not when moving or recovering', async () => {
    for (const [operation, extra, public_] of [['trash', {}, true], ['purge', { confirmSlug: 'about' }, true], ['move', { parentId: id, position: 0 }, false], ['recover', {}, false]] as const) {
      vi.mocked(revalidatePath).mockClear()
      await writePage({ operation, ...base, ...extra })
      expect(vi.mocked(revalidatePath).mock.calls.some(call => call[0] === '/[slug]')).toBe(public_)
      expect(revalidatePath).toHaveBeenCalledWith('/dashboard/pages')
    }
  })
  it('rejects malformed hierarchy and purge input before authorization', async () => {
    for (const input of [{ operation: 'move', ...base, parentId: 'nope', position: 0 }, { operation: 'move', ...base, parentId: null, position: -1 }, { operation: 'move', ...base, parentId: null, position: 1.5 }, { operation: 'purge', ...base }, { operation: 'purge', ...base, confirmSlug: 'Bad Slug' }, { operation: 'trash', ...base, values }]) {
      expect((await writePage(input)).error?.code).toBe('PAGE_INVALID_INPUT')
    }
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it.each(['PAGE_TRASHED', 'PAGE_HAS_CHILDREN', 'PAGE_HIERARCHY_CYCLE', 'PAGE_HIERARCHY_TOO_DEEP', 'PAGE_DELETE_CONFIRMATION_REQUIRED', 'PAGE_PARENT_TRASHED'])('maps %s', async code => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: code } })
    expect((await writePage({ operation: 'trash', ...base })).error?.code).toBe(code)
  })
  it('lists the active page tree for parent selection', async () => {
    const order = vi.fn(), limit = vi.fn()
    const tree = [{ id, title: 'About', slug: 'about', parent_id: null, position: 0 }]
    const chain = { select: () => chain, is: (column: string, value: null) => { expect([column, value]).toEqual(['trashed_at', null]); return chain }, order: (...args: unknown[]) => { order(...args); return chain }, limit }
    limit.mockResolvedValue({ data: tree, error: null })
    mocks.from.mockReturnValue(chain)
    expect((await listPageTree()).data).toEqual(tree)
    expect(order).toHaveBeenCalledWith('position')
    limit.mockResolvedValue({ data: [{ ...tree[0], position: 'x' }], error: null })
    expect((await listPageTree()).error?.code).toBe('PAGE_UNAVAILABLE')
  })
})

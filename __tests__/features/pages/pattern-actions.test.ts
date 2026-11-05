import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), client: vi.fn(), rpc: vi.fn(), from: vi.fn(), limit: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({ authorizeSession: mocks.authorize }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
import { revalidatePath } from 'next/cache'
import { listPagePatterns, writePagePattern } from '@/features/pages/actions'

const id = '29100000-0000-4000-8000-000000000001'
const document = { version: 2, content: { type: 'doc', content: [{ type: 'section', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hero' }] }] }] } }
const values = { name: 'Hero', description: '', document }
const row = { ...values, id, revision: id, created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-05T00:00:00Z', created_by: id, updated_by: id }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.authorize.mockResolvedValue({ profile: { id, role: 'admin' }, failure: null })
  mocks.client.mockResolvedValue({ rpc: mocks.rpc, from: mocks.from })
  const order = { order: () => order, limit: mocks.limit }
  mocks.from.mockReturnValue({ select: () => order })
  mocks.limit.mockResolvedValue({ data: [row], error: null })
  mocks.rpc.mockResolvedValue({ data: { pattern: row, replayed: false }, error: null })
})

describe('section pattern actions', () => {
  it.each(['UNAUTHENTICATED', 'FORBIDDEN', 'MFA_REQUIRED', 'AUTH_UNAVAILABLE'])('denies %s before database access', async code => {
    mocks.authorize.mockResolvedValue({ profile: null, failure: { code, error: 'Denied' } })
    expect((await listPagePatterns()).error?.code).toBe(code)
    expect((await writePagePattern({ operation: 'create', requestKey: 'key', values })).error).toMatchObject({ code, writeAttempted: false })
    expect(mocks.client).not.toHaveBeenCalled()
  })
  it('lists with pages:read and writes with pages:update through the caller RPC', async () => {
    expect((await listPagePatterns()).data).toEqual({ patterns: [row], unavailable: [] })
    expect(mocks.authorize).toHaveBeenLastCalledWith('pages:read')
    expect(mocks.limit).toHaveBeenCalledWith(200)
    expect((await writePagePattern({ operation: 'update', requestKey: 'key', patternId: id, expectedRevision: id, values })).data).toEqual({ pattern: row, replayed: false })
    expect(mocks.authorize).toHaveBeenLastCalledWith('pages:update')
    expect(mocks.rpc).toHaveBeenCalledWith('write_page_pattern', { p_operation: 'update', p_request_key: 'key', p_values: values, p_pattern_id: id, p_expected_revision: id })
    // Pattern writes never touch pages, so no page route is invalidated.
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('returns a null pattern after delete and maps database errors', async () => {
    mocks.rpc.mockResolvedValue({ data: { pattern: null, replayed: false }, error: null })
    expect((await writePagePattern({ operation: 'delete', requestKey: 'del', patternId: id, expectedRevision: id })).data).toEqual({ pattern: null, replayed: false })
    expect(mocks.rpc).toHaveBeenLastCalledWith('write_page_pattern', { p_operation: 'delete', p_request_key: 'del', p_values: null, p_pattern_id: id, p_expected_revision: id })
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'PAGE_PATTERN_STALE' } })
    expect((await writePagePattern({ operation: 'delete', requestKey: 'del2', patternId: id, expectedRevision: id })).error?.code).toBe('PAGE_PATTERN_STALE')
  })
  it('rejects invalid values and disallowed image hosts before any write', async () => {
    expect((await writePagePattern({ operation: 'create', requestKey: 'k', values: { ...values, document: { version: 1, blocks: [] } } })).error).toMatchObject({ code: 'PAGE_PATTERN_INVALID', writeAttempted: false })
    const image = { version: 2, content: { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://unconfigured.invalid/a.png', alt: 'A' } }] } }
    expect((await writePagePattern({ operation: 'create', requestKey: 'k', values: { ...values, document: image } })).error).toMatchObject({ code: 'PAGE_IMAGE_NOT_ALLOWED', image: { path: [0] }, writeAttempted: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('lists unsupported or no-longer-allowed patterns as unavailable without their documents', async () => {
    const future = { ...row, id: '29100000-0000-4000-8000-000000000002', document: { version: 3, content: {} } }
    const blocked = { ...row, id: '29100000-0000-4000-8000-000000000003', document: { version: 2, content: { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://unconfigured.invalid/a.png' } }] } } }
    mocks.limit.mockResolvedValue({ data: [row, future, blocked], error: null })
    const result = (await listPagePatterns()).data!
    expect(result.patterns.map(pattern => pattern.id)).toEqual([id])
    expect(result.unavailable.map(pattern => [pattern.id, pattern.reason])).toEqual([[future.id, 'PAGE_PATTERN_UNSUPPORTED'], [blocked.id, 'PAGE_IMAGE_NOT_ALLOWED']])
    expect(result.unavailable[0]).not.toHaveProperty('document')
  })
})

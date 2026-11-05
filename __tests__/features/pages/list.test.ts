import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), client: vi.fn(), from: vi.fn(), select: vi.fn(), filter: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), is: vi.fn(), not: vi.fn(), in: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({ authorizeSession: mocks.authorize }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
import { listPages } from '@/features/pages/management/list'
beforeEach(() => {
  vi.resetAllMocks()
  mocks.authorize.mockResolvedValue({ profile: { id: 'admin' }, failure: null })
  mocks.client.mockResolvedValue(mocks)
  for (const method of ['from', 'select', 'filter', 'eq', 'order', 'is', 'not'] as const) mocks[method].mockReturnValue(mocks)
  mocks.range.mockResolvedValue({ data: [], count: 0, error: null })
})
it.each(['FORBIDDEN', 'MFA_REQUIRED', 'UNAUTHENTICATED'])('denies %s before list access', async code => {
  mocks.authorize.mockResolvedValue({ failure: { code, error: 'Denied' }, profile: null })
  expect((await listPages({})).error?.code).toBe(code)
  expect(mocks.client).not.toHaveBeenCalled()
})
it('uses stable bounded server pagination, literal title search and no bodies', async () => {
  await listPages({ q: '100%_\\', status: 'published', page: '3' })
  expect(mocks.select).toHaveBeenCalledWith('id,title,slug,status,updated_at,revision,parent_id,trashed_at', { count: 'exact' })
  expect(mocks.is).toHaveBeenCalledWith('purged_at', null)
  expect(mocks.is).toHaveBeenCalledWith('trashed_at', null)
  expect(mocks.filter).toHaveBeenCalledWith('title', 'imatch', String.raw`100%_\\`)
  expect(mocks.eq).toHaveBeenCalledWith('status', 'published')
  expect(mocks.order).toHaveBeenCalledWith('id')
  expect(mocks.range).toHaveBeenCalledWith(40, 59)
})
it('handles invalid pagination and database errors safely', async () => {
  await listPages({ page: '-5', status: 'unknown' })
  expect(mocks.range).toHaveBeenCalledWith(0, 19)
  expect(mocks.eq).not.toHaveBeenCalled()
  mocks.range.mockRejectedValue(new Error('private SQL'))
  expect((await listPages({})).error?.code).toBe('PAGE_UNAVAILABLE')
})

it('returns an empty navigable page for an expired or out-of-range bookmark', async () => {
  mocks.range.mockResolvedValue({ data: null, count: null, error: { code: 'PGRST103', message: 'Range not satisfiable' } })
  expect(await listPages({ page: '999' })).toEqual({ data: { pages: [], count: 0, page: 999 }, error: null })
})
it('escapes regex metacharacters so PostgREST does not turn stars into wildcards', async () => {
  await listPages({ q: 'a*b.[c](d)+?^$|\\' })
  expect(mocks.filter).toHaveBeenCalledWith('title', 'imatch', String.raw`a\*b\.\[c\]\(d\)\+\?\^\$\|\\`)
})

const pid = '29010000-0000-4000-8000-00000000000a'
const row = (id: string, parent: string | null) => ({ id, title: `T${id.slice(-1)}`, slug: 's', status: 'draft', updated_at: '2026-11-05T00:00:00Z', revision: id, parent_id: parent, trashed_at: null })
it('lists only recoverable trash, newest trashed first, without purged tombstones', async () => {
  await listPages({ status: 'trash' })
  expect(mocks.is).toHaveBeenCalledWith('purged_at', null)
  expect(mocks.not).toHaveBeenCalledWith('trashed_at', 'is', null)
  expect(mocks.order).toHaveBeenCalledWith('trashed_at', { ascending: false })
  expect(mocks.eq).not.toHaveBeenCalled()
})
it('resolves parent titles in one query and fails closed on errors', async () => {
  mocks.range.mockResolvedValue({ data: [row('29010000-0000-4000-8000-000000000001', pid), row('29010000-0000-4000-8000-000000000002', null)], count: 2, error: null })
  mocks.select.mockImplementation((columns: string) => columns === 'id,title' ? { in: mocks.in } : mocks)
  mocks.in.mockResolvedValue({ data: [{ id: pid, title: 'Parent' }], error: null })
  const result = await listPages({})
  expect(result.data?.pages.map(page => page.parent_title)).toEqual(['Parent', null])
  expect(mocks.in).toHaveBeenCalledWith('id', [pid])
  mocks.in.mockResolvedValue({ data: null, error: { message: 'private' } })
  expect((await listPages({})).error?.code).toBe('PAGE_UNAVAILABLE')
})

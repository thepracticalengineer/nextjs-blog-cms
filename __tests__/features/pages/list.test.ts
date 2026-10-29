import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), client: vi.fn(), from: vi.fn(), select: vi.fn(), ilike: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({ authorizeSession: mocks.authorize }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
import { listPages } from '@/features/pages/management/list'
beforeEach(() => {
  vi.resetAllMocks()
  mocks.authorize.mockResolvedValue({ profile: { id: 'admin' }, failure: null })
  mocks.client.mockResolvedValue(mocks)
  for (const method of ['from', 'select', 'ilike', 'eq', 'order'] as const) mocks[method].mockReturnValue(mocks)
  mocks.range.mockResolvedValue({ data: [], count: 0, error: null })
})
it.each(['FORBIDDEN', 'MFA_REQUIRED', 'UNAUTHENTICATED'])('denies %s before list access', async code => {
  mocks.authorize.mockResolvedValue({ failure: { code, error: 'Denied' }, profile: null })
  expect((await listPages({})).error?.code).toBe(code)
  expect(mocks.client).not.toHaveBeenCalled()
})
it('uses stable bounded server pagination, literal title search and no bodies', async () => {
  await listPages({ q: '100%_\\', status: 'published', page: '3' })
  expect(mocks.select).toHaveBeenCalledWith('id,title,slug,status,updated_at', { count: 'exact' })
  expect(mocks.ilike).toHaveBeenCalledWith('title', '%100\\%\\_\\\\%')
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

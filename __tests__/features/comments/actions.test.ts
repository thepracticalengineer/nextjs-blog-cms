import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createComment } from '@/features/comments/actions'
const { rpc, authorizeSession } = vi.hoisted(() => ({ rpc: vi.fn(), authorizeSession: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/auth/session', () => ({ authorizeSession, getProfile: async () => ({ id: 'actor' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const post = '15700000-0000-4000-8000-000000000001'
const request = '15700000-0000-4000-8000-000000000002'
describe('createComment', () => {
 beforeEach(() => { vi.clearAllMocks(); authorizeSession.mockResolvedValue({ profile: { id: 'actor' }, failure: null }); rpc.mockResolvedValue({ data: { id: request }, error: null }) })
 it('uses a stable request ID and normalized Unicode content through the protected RPC', async () => {
  await expect(createComment(post, ' \r\n😀\r\nhello\u00a0', 'post', request)).resolves.toEqual({ data: { id: request } })
  expect(rpc).toHaveBeenCalledWith('create_comment', { p_post_id: post, p_content: '😀\nhello', p_request_id: request })
 })
 it.each([' \t\n\u00a0\ufeff', 'a'.repeat(2001), null])('rejects invalid content without a write', async content => {
  expect(await createComment(post, content, 'post', request)).toHaveProperty('error')
  expect(rpc).not.toHaveBeenCalled()
 })
 it('counts code points, not UTF-16 units', async () => {
  expect(await createComment(post, '😀'.repeat(2000), 'post', request)).toHaveProperty('data')
 })
 it('rejects missing request IDs', async () => {
  expect(await createComment(post, 'hello', 'post', undefined)).toHaveProperty('error')
  expect(rpc).not.toHaveBeenCalled()
 })
 it('preserves auth guidance without writing', async () => {
  authorizeSession.mockResolvedValue({ failure: { error: 'Complete two-factor authentication, then retry.' } })
  expect(await createComment(post, 'hello', 'post', request)).toEqual({ error: 'Complete two-factor authentication, then retry.' })
  expect(rpc).not.toHaveBeenCalled()
 })
 it('returns bounded retry guidance', async () => {
  rpc.mockResolvedValue({ error: { message: 'COMMENT_RATE_LIMIT', details: '42' } })
  expect(await createComment(post, 'hello', 'post', request)).toEqual({ error: 'Too many comments. Try again in 42 seconds. Your draft is kept.', retryAfterSeconds: 42 })
 })
 it('does not expose database or transport errors', async () => {
  rpc.mockResolvedValueOnce({ error: { message: 'secret database details' } }).mockRejectedValueOnce(new Error('secret'))
  for (let i=0;i<2;i++) expect(await createComment(post, 'hello', 'post', request)).toEqual({ error: 'Could not post your comment. Your draft is kept; try again.' })
 })
})

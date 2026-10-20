import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readCommentReactions, setCommentReaction } from '@/features/comments/reaction-actions'
import { createClient } from '@/lib/supabase/server'
import { authorizeSession } from '@/lib/auth/session'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ authorizeSession: vi.fn() }))
const id = '15900000-0000-4000-8000-000000000020'
const rpc = vi.fn()
const snapshot = { counts: { like: 1, love: 0, celebrate: 0, insightful: 0 }, selection: 'like' }
beforeEach(() => {
 vi.clearAllMocks()
 vi.mocked(createClient).mockResolvedValue({ rpc, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'viewer' } }, error: null }) } } as never)
 vi.mocked(authorizeSession).mockResolvedValue({ profile: { id: 'viewer', role: 'reader' }, failure: null } as never)
 rpc.mockResolvedValue({ data: snapshot, error: null })
})
describe('comment reaction actions', () => {
 it.each(['like','love','celebrate','insightful',null])('sets explicit desired state %s for a reader without publishing permission', async reaction => {
  const result = await setCommentReaction(id, reaction)
  expect(result).toEqual({ data: snapshot })
  expect(rpc).toHaveBeenCalledWith('set_comment_reaction', { p_comment_id: id, p_reaction: reaction })
 })
 it.each([['bad','like'],[id,'fire'],[id,{}],[null,'like']])('rejects malformed input before accessing authentication', async (comment, reaction) => {
  expect(await setCommentReaction(comment, reaction)).toHaveProperty('error')
  expect(authorizeSession).not.toHaveBeenCalled()
 })
 it.each(['UNAUTHENTICATED','MFA_REQUIRED','AUTH_UNAVAILABLE','FORBIDDEN'])('denies %s before database writes', async code => {
  vi.mocked(authorizeSession).mockResolvedValue({ profile: null, failure: { code, error: 'Denied', status: 403 } } as never)
  expect(await setCommentReaction(id,'like')).toEqual({ error: 'Denied', retryable: code === 'AUTH_UNAVAILABLE' })
  expect(rpc).not.toHaveBeenCalled()
 })
 it.each([
  ['REACTION_RATE_LIMIT','Too many reaction changes. Wait a minute, then retry.'],
  ['REACTION_UNAVAILABLE','This comment is no longer available for reactions.'],
  ['internal secret','Could not save your reaction. Refresh and try again.'],
 ])('maps database error %s to safe feedback', async (message, error) => {
  rpc.mockResolvedValue({ error: { message }, data: null })
  expect(await setCommentReaction(id,'like')).toEqual({ error, ...(message === 'REACTION_UNAVAILABLE' ? {retryable:false} : {}) })
 })
 it('handles a lost mutation response without claiming success', async () => {
  rpc.mockRejectedValue(new Error('network'))
  expect(await setCommentReaction(id,null)).toHaveProperty('error')
 })
 it('rejects an invalid read id', async () => {
  expect(await readCommentReactions('bad')).toHaveProperty('error')
  expect(createClient).not.toHaveBeenCalled()
 })
 it('batches public counts and own selection without returning reactor identities', async () => {
  rpc.mockResolvedValue({ data: [{ comment_id: id, ...snapshot }], error: null })
  expect(await readCommentReactions(id)).toEqual({ data: { [id]: snapshot }, viewerId: 'viewer' })
 })
 it('does not manufacture zero counts when the read fails', async () => {
  rpc.mockResolvedValue({ error: { message: 'private details' }, data: null })
  expect(await readCommentReactions(id)).toEqual({ error: 'Could not refresh reactions. Try again.' })
 })
 it('fails closed on malformed snapshots', async () => {
  rpc.mockResolvedValue({ data: { counts: {}, selection: 'invalid' }, error: null })
  expect(await setCommentReaction(id,'like')).toHaveProperty('error')
 })
})

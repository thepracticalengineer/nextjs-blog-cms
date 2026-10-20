import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readArticleReactions, setArticleReaction } from '@/features/article-reactions/actions'
import { createClient } from '@/lib/supabase/server'
import { authorizeSession } from '@/lib/auth/session'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ authorizeSession: vi.fn() }))
const id = '15300000-0000-4000-8000-000000000010'
const rpc = vi.fn()
const snapshot = { counts: { love: 1, unicorn: 0, mind_blown: 0, celebrate: 0, fire: 1 }, selections: ['love', 'fire'] }
beforeEach(() => {
 vi.resetAllMocks()
 vi.mocked(createClient).mockResolvedValue({ rpc, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'viewer' } }, error: null }) } } as never)
 vi.mocked(authorizeSession).mockResolvedValue({ profile: { id: 'viewer' }, failure: null } as never)
 rpc.mockResolvedValue({ data: snapshot, error: null })
})
describe('article reaction action boundaries', () => {
 it.each([true,false])('sets explicit selected=%s without requiring publishing permission', async selected => {
  expect(await setArticleReaction(id,'love',selected)).toEqual({data:snapshot})
  expect(authorizeSession).toHaveBeenCalledWith()
  expect(rpc).toHaveBeenCalledWith('set_article_reaction',{p_post_id:id,p_reaction:'love',p_selected:selected})
 })
 it.each([['bad','love',true],[id,'like',true],[id,null,true],[id,'love',null],[id,'love','false']])('rejects malformed input %j before auth',async(post,type,selected)=>{
  expect(await setArticleReaction(post,type,selected)).toMatchObject({retryable:false})
  expect(authorizeSession).not.toHaveBeenCalled()
 })
 it.each(['UNAUTHENTICATED','MFA_REQUIRED','AUTH_UNAVAILABLE','FORBIDDEN'])('denies %s before RPC',async code=>{
  vi.mocked(authorizeSession).mockResolvedValue({profile:null,failure:{code,error:'Denied',status:403}} as never)
  expect(await setArticleReaction(id,'love',true)).toEqual({error:'Denied',retryable:code==='AUTH_UNAVAILABLE'})
  expect(rpc).not.toHaveBeenCalled()
 })
 it.each(['REACTION_UNAVAILABLE','REACTION_AUTH_REQUIRED','REACTION_INVALID'])('does not offer retries for %s',async message=>{
  rpc.mockResolvedValue({error:{message},data:null})
  expect(await setArticleReaction(id,'love',true)).toMatchObject({error:expect.any(String),retryable:false})
 })
 it('hides internal database errors and treats uncertain writes as retryable',async()=>{
  rpc.mockRejectedValue(new Error('secret database details'))
  const result=await setArticleReaction(id,'fire',true)
  expect(result).toEqual({error:'Could not save your reaction. Refresh and try again.'})
 })
 it('returns counts and independent selections, stripping unexpected private fields',async()=>{
  rpc.mockResolvedValue({data:{...snapshot,user_id:'secret'},error:null})
  expect(await readArticleReactions(id)).toEqual({data:snapshot,viewerId:'viewer'})
 })
 it('distinguishes unavailable articles from zero counts',async()=>{
  rpc.mockResolvedValue({data:null,error:null})
  expect(await readArticleReactions(id)).toEqual({data:null,viewerId:'viewer'})
  expect(await setArticleReaction(id,'love',true)).toHaveProperty('error')
 })
 it.each([{counts:{},selections:[]},{...snapshot,selections:['invalid']},{...snapshot,counts:{...snapshot.counts,love:-1}}])('fails closed on malformed snapshots',async data=>{
  rpc.mockResolvedValue({data,error:null})
  expect(await readArticleReactions(id)).toHaveProperty('error')
  expect(await setArticleReaction(id,'love',true)).toHaveProperty('error')
 })
 it('does not manufacture zero counts on read failure',async()=>{
  rpc.mockResolvedValue({data:null,error:{message:'secret'}})
  expect(await readArticleReactions(id)).toEqual({error:'Could not refresh reactions. Try again.'})
 })
 it('rejects malformed reads without creating a client',async()=>{
  expect(await readArticleReactions('bad')).toHaveProperty('error')
  expect(createClient).not.toHaveBeenCalled()
 })
})

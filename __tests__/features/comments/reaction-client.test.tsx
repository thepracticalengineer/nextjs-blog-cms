import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCommentReactions, useReactionSession } from '@/features/comments/reaction-client'
import { createClient } from '@/lib/supabase/client'
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
const id='15900000-0000-4000-8000-000000000020'
const rpc=vi.fn(), getSession=vi.fn(), unsubscribe=vi.fn(), getUser=vi.fn(), from=vi.fn()
let notify: (event:string,session:unknown)=>void
beforeEach(()=>{
 vi.clearAllMocks()
 getSession.mockResolvedValue({data:{session:{user:{id:'reader'}}},error:null})
 rpc.mockResolvedValue({data:[{comment_id:id,counts:{like:1,love:0,celebrate:0,insightful:0},selection:'like'}],error:null})
 vi.mocked(createClient).mockReturnValue({rpc,from,auth:{getSession,getUser,onAuthStateChange:vi.fn(callback=>{
  notify=callback
  return {data:{subscription:{unsubscribe}}}
 })}} as never)
})
afterEach(()=>vi.useRealTimers())
describe('browser reaction reads and identity',()=>{
 it('reads aggregates directly without a verified-user network request or profile query',async()=>{
  expect(await readCommentReactions(id)).toEqual({data:{[id]:{counts:{like:1,love:0,celebrate:0,insightful:0},selection:'like'}},viewerId:'reader'})
  expect(rpc).toHaveBeenCalledWith('get_comment_reactions',{p_post_id:id})
  expect(getUser).not.toHaveBeenCalled();expect(from).not.toHaveBeenCalled()
 })
 it('preserves the server identity while session initialization is delayed',async()=>{
  getSession.mockReturnValue(new Promise(()=>{}))
  const {result,unmount}=renderHook(()=>useReactionSession('reader'))
  expect(result.current).toEqual({viewerId:'reader',loading:false})
  expect(from).not.toHaveBeenCalled()
  act(()=>notify('SIGNED_OUT',null))
  expect(result.current.viewerId).toBeNull()
  unmount();expect(unsubscribe).toHaveBeenCalled()
 })
 it('does not overwrite a newer account event with a late initial session',async()=>{
  let resolve!: (value:unknown)=>void
  getSession.mockReturnValue(new Promise(done=>{resolve=done}))
  const {result}=renderHook(()=>useReactionSession('reader'))
  act(()=>notify('SIGNED_IN',{user:{id:'other'}}))
  await act(async()=>resolve({data:{session:{user:{id:'reader'}}},error:null}))
  expect(result.current.viewerId).toBe('other')
 })
 it('fails closed when the local session cannot be loaded',async()=>{
  getSession.mockRejectedValue(new Error('session unavailable'))
  const {result}=renderHook(()=>useReactionSession('reader'))
  await waitFor(()=>expect(result.current.viewerId).toBeNull())
 })
 it('does not manufacture zero counts after an RPC failure',async()=>{
  rpc.mockResolvedValue({data:null,error:{message:'private'}})
  expect(await readCommentReactions(id)).toEqual({error:'Could not refresh reactions. Try again.'})
 })
 it('expires a stuck session hint and accepts a later auth event',async()=>{
  vi.useFakeTimers()
  getSession.mockReturnValue(new Promise(()=>{}))
  const {result}=renderHook(()=>useReactionSession('reader'))
  await act(async()=>{await vi.advanceTimersByTimeAsync(10_001)})
  expect(result.current.viewerId).toBeNull()
  act(()=>notify('SIGNED_IN',{user:{id:'new'}}))
  expect(result.current.viewerId).toBe('new')
 })
 it('rejects malformed aggregate responses without exposing unexpected rows',async()=>{
  rpc.mockResolvedValue({data:[{comment_id:id,counts:{like:-1},selection:'other-user'}],error:null})
  expect(await readCommentReactions(id)).toHaveProperty('error')
 })
 it('does not read aggregates after a failed session load',async()=>{
  getSession.mockResolvedValue({data:{session:null},error:{message:'unavailable'}})
  expect(await readCommentReactions(id)).toHaveProperty('error')
  expect(rpc).not.toHaveBeenCalled()
 })
 it('rejects malformed public input before creating the browser client',async()=>{
  expect(await readCommentReactions('bad')).toHaveProperty('error')
  expect(createClient).not.toHaveBeenCalled()
 })
})

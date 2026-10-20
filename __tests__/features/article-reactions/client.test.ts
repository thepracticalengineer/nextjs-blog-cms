import { beforeEach, expect, it, vi } from 'vitest'
import { readArticleReactions } from '@/features/article-reactions/client'
import { createClient } from '@/lib/supabase/client'
vi.mock('@/lib/supabase/client',()=>({createClient:vi.fn()}))
const rpc=vi.fn(), getSession=vi.fn()
const id='15300000-0000-4000-8000-000000000010'
const snapshot={counts:{love:0,unicorn:0,mind_blown:0,celebrate:0,fire:0},selections:[]}
beforeEach(()=>{
 vi.resetAllMocks()
 vi.mocked(createClient).mockReturnValue({rpc,auth:{getSession}} as never)
 getSession.mockResolvedValue({data:{session:{user:{id:'reader'}}},error:null})
 rpc.mockResolvedValue({data:snapshot,error:null})
})
it('reads through browser RPC with identity for selection isolation',async()=>{
 expect(await readArticleReactions(id)).toEqual({data:snapshot,viewerId:'reader'})
 expect(rpc).toHaveBeenCalledWith('get_article_reactions',{p_post_id:id})
})
it('returns guest counts without a private identity',async()=>{
 getSession.mockResolvedValue({data:{session:null},error:null})
 expect(await readArticleReactions(id)).toEqual({data:snapshot,viewerId:null})
})
it.each([null,{counts:{},selections:[]}])('distinguishes unavailable from malformed data %j',async data=>{
 rpc.mockResolvedValue({data,error:null})
 expect(await readArticleReactions(id)).toEqual(data===null?{data:null,viewerId:'reader'}:{error:'Could not refresh reactions. Try again.'})
})
it('handles session and network failures without publishing zeros',async()=>{
 getSession.mockResolvedValue({data:{session:null},error:{message:'auth outage'}})
 expect(await readArticleReactions(id)).toHaveProperty('error')
 expect(rpc).not.toHaveBeenCalled()
 getSession.mockRejectedValue(new Error('network'))
 expect(await readArticleReactions(id)).toHaveProperty('error')
})
it('rejects invalid post IDs before browser access',async()=>{
 expect(await readArticleReactions('bad')).toHaveProperty('error')
 expect(createClient).not.toHaveBeenCalled()
})

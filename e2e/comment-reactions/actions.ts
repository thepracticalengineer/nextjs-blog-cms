import type { Reaction, ReactionReadResult, ReactionResult } from '@/features/comments/reactions'
function endpoint() {
 const params=new URLSearchParams(location.search)
 if(!params.has('viewer')) params.set('viewer','reader')
 return `/__reactions?${params}`
}
export async function readCommentReactions(): Promise<ReactionReadResult> {
 return (await fetch(endpoint())).json()
}
export async function setCommentReaction(id: string, desired: Reaction | null): Promise<ReactionResult> {
 const response = await fetch(endpoint(), {
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,desired}),
 })
 if (!response.ok) return { error:'Connection lost. Refresh and retry.' }
 return response.json()
}

export function useReactionSession() {
 const viewer=new URLSearchParams(location.search).get('viewer')??'reader'
 return {viewerId:viewer==='guest'?null:viewer,loading:false}
}

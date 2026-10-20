import type { ArticleReaction, ArticleReactionReadResult, ArticleReactionResult } from '@/features/article-reactions/reactions'
function endpoint() {
 const params=new URLSearchParams(location.search)
 if(!params.has('viewer')) params.set('viewer','reader')
 return `/__article_reactions?${params}`
}
export async function readArticleReactions(): Promise<ArticleReactionReadResult> {
 return (await fetch(endpoint())).json()
}
export async function setArticleReaction(id: string, reaction: ArticleReaction, selected: boolean): Promise<ArticleReactionResult> {
 const response=await fetch(endpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,reaction,selected})})
 return response.ok?response.json():{error:'Connection lost. Refresh and retry.'}
}
export function useReactionSession() {
 const viewer=new URLSearchParams(location.search).get('viewer')??'reader'
 return {viewerId:viewer==='guest'?null:viewer,loading:false}
}

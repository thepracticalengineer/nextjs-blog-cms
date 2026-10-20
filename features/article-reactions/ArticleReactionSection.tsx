import { readArticleReactions } from './actions'
import { ArticleReactions } from './ArticleReactions'

export async function ArticleReactionSection({ postId, postSlug }: { postId: string; postSlug: string }) {
  const result = await readArticleReactions(postId)
  return <ArticleReactions postId={postId} returnPath={`/blog/${encodeURIComponent(postSlug)}#article-reactions`}
    initialData={result.data ?? null} initialViewerId={result.viewerId ?? null} />
}

import { PostCard } from './PostCard'
import type { PostWithRelations } from '../types'

interface PostListProps {
  posts: PostWithRelations[]
  showTags?: boolean
}

export function PostList({ posts, showTags = false }: PostListProps) {
  if (posts.length === 0) {
    return (
      <div className="text-center py-16 space-y-2">
        <p className="text-lg font-medium text-foreground">No posts yet.</p>
        <p className="text-sm text-muted-foreground">Check back soon for new articles.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} showTags={showTags} />
      ))}
    </div>
  )
}

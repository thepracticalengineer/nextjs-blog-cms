import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AuthorByline } from '@/features/authors/components/AuthorByline'
import type { PostWithRelations } from '../types'

interface PostCardProps {
  post: PostWithRelations
  showTags?: boolean
}

export function PostCard({ post, showTags = false }: PostCardProps) {
  return (
    <Card className="overflow-hidden hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 flex flex-col">
      {post.cover_image && (
        <div className="relative h-48 w-full overflow-hidden">
          <Image
            src={post.cover_image}
            alt={post.title}
            fill
            className="object-cover transition-transform duration-300 hover:scale-105"
          />
        </div>
      )}
      <CardHeader className="pb-2">
        {post.category && (
          <Link href={`/blog/category/${post.category.slug}`}>
            <Badge className="mb-2 text-xs rounded-full px-3 w-fit">{post.category.name}</Badge>
          </Link>
        )}
        <Link href={`/blog/${post.slug}`}>
          <h2 className="text-lg font-semibold hover:text-primary transition-colors line-clamp-2 leading-snug">
            {post.title}
          </h2>
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 justify-between gap-4">
        {post.excerpt && (
          <p className="text-muted-foreground text-sm line-clamp-3">{post.excerpt}</p>
        )}
        {showTags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Link key={tag.id} href={`/blog/tag/${tag.slug}`} className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
                <Badge variant="secondary" className="text-xs">#{tag.name}</Badge>
              </Link>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <AuthorByline author={post.author} />
          {post.published_at && (
            <time dateTime={post.published_at}>
              {format(new Date(post.published_at), 'MMM d, yyyy')}
            </time>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

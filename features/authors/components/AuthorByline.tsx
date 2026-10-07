import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { PostWithRelations } from '@/features/posts/types'
import { authorInitials, authorName, publicWebUrl } from '../presentation'

export function AuthorByline({ author, showAvatar = false }: {
  author: PostWithRelations['author']
  showAvatar?: boolean
}) {
  if (!author) return <span className="font-medium">Unknown</span>
  const avatar = publicWebUrl(author.avatar_url)
  return (
    <Link
      href={`/authors/${author.id}`}
      className="inline-flex min-w-0 items-center gap-2 rounded-sm font-medium hover:text-primary hover:underline underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      {showAvatar && (
        <Avatar className="size-8" aria-hidden="true">
          {avatar && <AvatarImage src={avatar} alt="" />}
          <AvatarFallback className="text-xs">{authorInitials(author.full_name)}</AvatarFallback>
        </Avatar>
      )}
      <span className="min-w-0 break-words">{authorName(author.full_name)}</span>
    </Link>
  )
}

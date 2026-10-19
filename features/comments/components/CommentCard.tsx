// features/comments/components/CommentCard.tsx
import { formatDistanceToNow } from 'date-fns'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { CommentReactions } from './CommentReactions'
import { DeleteCommentButton } from './DeleteCommentButton'
import type { CommentWithAuthor } from '../types'
import type { Role } from '@/lib/permissions'

interface CommentCardProps {
  comment: CommentWithAuthor
  currentProfileId: string | null
  currentProfileRole: Role | null
  postSlug: string
}

export function CommentCard({ comment, currentProfileId, currentProfileRole, postSlug }: CommentCardProps) {
  const initials = comment.author?.full_name
    ? comment.author.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  const canDelete =
    currentProfileRole === 'admin' ||
    (currentProfileId != null && currentProfileId === comment.author_id)

  return (
    <div className="flex gap-3 py-5 border-b border-border last:border-0">
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-semibold text-sm text-foreground">
            {comment.author?.full_name ?? 'Unknown'}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
          </span>
          {canDelete && (
            <div className="ml-auto">
              <DeleteCommentButton commentId={comment.id} postSlug={postSlug} />
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{comment.content}</p>
        <CommentReactions commentId={comment.id} />
      </div>
    </div>
  )
}

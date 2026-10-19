// features/comments/components/CommentSection.tsx
import { AuthProvider } from '@/features/auth/context/AuthProvider'
import { CommentReactionProvider } from './CommentReactionProvider'
import { readCommentReactions } from '../reaction-actions'
import { createClient } from '@/lib/supabase/server'
import { getCommentsByPost } from '../queries'
import { CommentForm } from './CommentForm'
import { CommentList } from './CommentList'
import type { Role } from '@/lib/permissions'

interface CommentSectionProps {
  postId: string
  postSlug: string
}

export async function CommentSection({ postId, postSlug }: CommentSectionProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let currentProfile: { id: string; full_name: string | null; role: string } | null = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', user.id)
      .single()
    currentProfile = data
  }

  const [comments, reactions] = await Promise.all([getCommentsByPost(postId), readCommentReactions(postId)])

  return (
    <section className="mt-12 pt-8 border-t border-border space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-4">💬 Leave a Comment</h2>
        <CommentForm
          postId={postId}
          postSlug={postSlug}
          authorName={currentProfile?.full_name ?? null}
        />
      </div>
      <AuthProvider>
        <CommentReactionProvider postId={postId} initialData={reactions.data ?? null} initialViewerId={reactions.viewerId ?? null}>
          <CommentList
            comments={comments}
            currentProfileId={currentProfile?.id ?? null}
            currentProfileRole={(currentProfile?.role as Role) ?? null}
            postSlug={postSlug}
          />
        </CommentReactionProvider>
      </AuthProvider>
    </section>
  )
}

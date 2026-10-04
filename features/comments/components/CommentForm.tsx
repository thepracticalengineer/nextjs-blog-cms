// features/comments/components/CommentForm.tsx
'use client'

import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createComment } from '../actions'

const schema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(2000, 'Comment must be 2,000 characters or less'),
})

type FormValues = z.infer<typeof schema>

interface CommentFormProps {
  postId: string
  postSlug: string
  authorName: string | null
}

export function CommentForm({ postId, postSlug, authorName }: CommentFormProps) {
  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const content = useWatch({ control, name: 'content', defaultValue: '' })

  async function onSubmit(values: FormValues) {
    const result = await createComment(postId, values.content, postSlug)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Comment posted!')
      reset()
    }
  }

  if (!authorName) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-6 text-center">
        <p className="text-sm text-muted-foreground mb-3">Want to join the conversation?</p>
        <Link href="/login">
          <Button variant="default" size="sm">Sign in to comment</Button>
        </Link>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">
        Commenting as <span className="font-semibold text-foreground">{authorName}</span>
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div>
          <Textarea
            {...register('content')}
            placeholder="Share your thoughts..."
            rows={3}
            className="resize-none"
            aria-label="Comment content"
          />
          {errors.content && (
            <p className="text-xs text-destructive mt-1">{errors.content.message}</p>
          )}
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{content?.length ?? 0} / 2,000</span>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? 'Posting...' : 'Post Comment'}
          </Button>
        </div>
      </form>
    </div>
  )
}

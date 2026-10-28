// features/comments/components/CommentForm.tsx
'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createComment } from '../actions'
import { commentContentSchema, commentLength } from '../validation'

const schema = z.object({
  content: commentContentSchema,
})

type FormValues = z.infer<typeof schema>

interface CommentFormProps {
  postId: string
  postSlug: string
  authorName: string | null
}

export function CommentForm({ postId, postSlug, authorName }: CommentFormProps) {
  const pending = useRef(false)
  const submission = useRef<{ postId: string; content: string; id: string } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { content: '' },
  })

  const content = useWatch({ control, name: 'content', defaultValue: '' })

  async function onSubmit(values: FormValues) {
    setSaveError(null)
    try {
      // Retain the ID after ambiguous failures; changed text is a new operation.
      if (!submission.current || submission.current.content !== values.content || submission.current.postId !== postId) {
        submission.current = { postId, content: values.content, id: crypto.randomUUID() }
      }
      const result = await createComment(postId, values.content, postSlug, submission.current.id)
      if (result.error) {
        setSaveError(result.error)
      } else {
        submission.current = null
        toast.success('Comment posted!')
        reset()
      }
    } catch {
      setSaveError('Could not post your comment. Your draft is kept; try again.')
    }
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Guard before asynchronous validation so a second submit cannot finish
    // React Hook Form's pending state while the first write is still running.
    if (pending.current) return
    pending.current = true
    try {
      await handleSubmit(onSubmit)(event)
    } finally {
      pending.current = false
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
      <form onSubmit={handleFormSubmit} className="space-y-3">
        <div>
          <Textarea
            {...register('content')}
            placeholder="Share your thoughts..."
            rows={3}
            readOnly={isSubmitting}
            aria-invalid={!!errors.content}
            aria-describedby={errors.content ? "comment-feedback" : undefined}
            className="resize-none"
            aria-label="Comment content"
          />
          {errors.content && (
            <p id="comment-feedback" role="alert" className="text-xs text-destructive mt-1">{errors.content.message}</p>
          )}
        </div>
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{commentLength(content ?? '')} / 2,000</span>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? 'Posting...' : 'Post Comment'}
          </Button>
        </div>
      </form>
    </div>
  )
}

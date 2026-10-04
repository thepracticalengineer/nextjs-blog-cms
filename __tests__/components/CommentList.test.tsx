import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CommentList } from '@/features/comments/components/CommentList'
import type { CommentWithAuthor } from '@/features/comments/types'

// CommentCard is already covered by its own test — mock it here to focus on CommentList logic
vi.mock('@/features/comments/components/CommentCard', () => ({
  CommentCard: ({ comment }: { comment: CommentWithAuthor }) => (
    <div data-testid="comment-card">{comment.content}</div>
  ),
}))

const makeComment = (id: string, content: string): CommentWithAuthor => ({
  id,
  post_id: 'post-1',
  author_id: 'u1',
  content,
  created_at: '2024-01-01',
  author: { id: 'u1', full_name: 'Alice', avatar_url: null },
})

describe('CommentList', () => {
  it('renders nothing when there are no comments', () => {
    const { container } = render(
      <CommentList comments={[]} currentProfileId={null} currentProfileRole={null} postSlug="post-1" />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a single comment with singular label', () => {
    const comments = [makeComment('c1', 'Hello world')]
    render(
      <CommentList comments={comments} currentProfileId="u1" currentProfileRole="author" postSlug="post-1" />
    )
    expect(screen.getByText('1 Comment')).toBeInTheDocument()
    expect(screen.getByTestId('comment-card')).toBeInTheDocument()
  })

  it('renders plural label for multiple comments', () => {
    const comments = [makeComment('c1', 'First'), makeComment('c2', 'Second')]
    render(
      <CommentList comments={comments} currentProfileId="u1" currentProfileRole="author" postSlug="post-1" />
    )
    expect(screen.getByText('2 Comments')).toBeInTheDocument()
    expect(screen.getAllByTestId('comment-card')).toHaveLength(2)
  })
})

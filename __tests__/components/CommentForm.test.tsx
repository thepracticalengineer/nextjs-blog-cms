// __tests__/components/CommentForm.test.tsx
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createComment } from '@/features/comments/actions'
import { CommentForm } from '@/features/comments/components/CommentForm'

vi.mock('@/features/comments/actions', () => ({
  createComment: vi.fn().mockResolvedValue({ data: { id: 'new-comment' } }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

beforeEach(() => { vi.clearAllMocks(); vi.mocked(createComment).mockResolvedValue({ data: { id: 'new-comment' } }) })

describe('CommentForm', () => {

  it('renders textarea and submit button when authenticated', () => {
    render(<CommentForm postId="post-1" postSlug="test-post" authorName="Jane Doe" />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /post comment/i })).toBeInTheDocument()
  })

  it('shows "Commenting as" label with author name', () => {
    render(<CommentForm postId="post-1" postSlug="test-post" authorName="Jane Doe" />)
    expect(screen.getByText(/commenting as/i)).toBeInTheDocument()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('shows sign-in CTA when not authenticated', () => {
    render(<CommentForm postId="post-1" postSlug="test-post" authorName={null} />)
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows validation error for empty content', async () => {
    render(<CommentForm postId="post-1" postSlug="test-post" authorName="Jane Doe" />)
    fireEvent.click(screen.getByRole('button', { name: /post comment/i }))
    await waitFor(() => {
      expect(screen.getByText(/comment cannot be empty/i)).toBeInTheDocument()
    })
  })

  it('calls createComment on valid submit', async () => {
    const { createComment } = await import('@/features/comments/actions')
    render(<CommentForm postId="post-1" postSlug="test-post" authorName="Jane Doe" />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nice post!' } })
    fireEvent.click(screen.getByRole('button', { name: /post comment/i }))
    await waitFor(() => {
      expect(createComment).toHaveBeenCalledWith('post-1', 'Nice post!', 'test-post', expect.any(String))
    })
  })
})

it('retains draft and request ID after a rejected write, then rotates after success', async () => {
 const { createComment } = await import('@/features/comments/actions')
 vi.mocked(createComment).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: { id: 'ok' } })
 render(<CommentForm postId="post-1" postSlug="test-post" authorName="Jane" />)
 const input = screen.getByRole('textbox')
 const button = screen.getByRole('button', { name: /post comment/i })
 fireEvent.change(input, { target: { value: ' hello ' } })
 fireEvent.click(button)
 await screen.findByRole('alert')
 expect(input).toHaveValue(' hello ')
 const requestId = vi.mocked(createComment).mock.calls[0][3]
 fireEvent.click(button)
 await waitFor(() => expect(input).toHaveValue(''))
 expect(vi.mocked(createComment).mock.calls[1][3]).toBe(requestId)
 fireEvent.change(input, { target: { value: ' hello ' } })
 fireEvent.click(button)
 await waitFor(() => expect(createComment).toHaveBeenCalledTimes(3))
 expect(vi.mocked(createComment).mock.calls[2][3]).not.toBe(requestId)
})
it('preserves failed drafts and uses a new ID for changed text', async () => {
 const { createComment } = await import('@/features/comments/actions')
 vi.mocked(createComment).mockClear().mockResolvedValue({ error: 'Could not post your comment. Try again.' })
 render(<CommentForm postId="post-1" postSlug="test-post" authorName="Jane" />)
 const input = screen.getByRole('textbox')
 fireEvent.change(input, { target: { value: 'hello' } })
 fireEvent.click(screen.getByRole('button', { name: /post comment/i }))
 expect(await screen.findByRole('alert')).toHaveTextContent('Try again')
 expect(input).toHaveValue('hello')
 const first = vi.mocked(createComment).mock.calls[0][3]
 fireEvent.change(input, { target: { value: 'changed' } })
 fireEvent.click(screen.getByRole('button', { name: /post comment/i }))
 await waitFor(() => expect(createComment).toHaveBeenCalledTimes(2))
 expect(vi.mocked(createComment).mock.calls[1][3]).not.toBe(first)
})
it('rejects whitespace and displays normalized code point counts', async () => {
 const { createComment } = await import('@/features/comments/actions')
 vi.mocked(createComment).mockClear()
 render(<CommentForm postId="post-1" postSlug="test-post" authorName="Jane" />)
 fireEvent.change(screen.getByRole('textbox'), { target: { value: ' \t\n\u00a0' } })
 fireEvent.click(screen.getByRole('button', { name: /post comment/i }))
 expect(await screen.findByRole('alert')).toHaveTextContent('Comment cannot be empty')
 expect(createComment).not.toHaveBeenCalled()
 fireEvent.change(screen.getByRole('textbox'), { target: { value: ' 😀 ' } })
 expect(screen.getByText('1 / 2,000')).toBeInTheDocument()
})
it('keeps the field read-only until the original write settles despite duplicate submit events', async () => {
 const { createComment } = await import('@/features/comments/actions')
 let resolve!: (value: { data: { id: string } }) => void
 vi.mocked(createComment).mockReturnValueOnce(new Promise(done => { resolve = done }))
 render(<CommentForm postId="post-1" postSlug="test-post" authorName="Jane" />)
 const input = screen.getByRole('textbox')
 fireEvent.change(input, { target: { value: 'Draft' } })
 const form = input.closest('form')!
 fireEvent.submit(form)
 fireEvent.submit(form)
 await waitFor(() => expect(createComment).toHaveBeenCalledTimes(1))
 expect(input).toHaveAttribute('readonly')
 expect(screen.getByRole('button', { name: 'Posting...' })).toBeDisabled()
 resolve({ data: { id: 'saved' } })
 await waitFor(() => expect(input).toHaveValue(''))
})
it('starts a new operation if the mounted form moves to another article', async () => {
 vi.mocked(createComment).mockResolvedValue({ error: 'Try again' })
 const { rerender } = render(<CommentForm postId="post-1" postSlug="first" authorName="Jane" />)
 fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Same text' } })
 fireEvent.click(screen.getByRole('button', { name: /post comment/i }))
 await screen.findByRole('alert')
 const firstId = vi.mocked(createComment).mock.calls[0][3]
 rerender(<CommentForm postId="post-2" postSlug="second" authorName="Jane" />)
 fireEvent.click(screen.getByRole('button', { name: /post comment/i }))
 await waitFor(() => expect(createComment).toHaveBeenCalledTimes(2))
 expect(vi.mocked(createComment).mock.calls[1][3]).not.toBe(firstId)
})

it('blocks repeated writes during the server cooldown and retries with the same ID', async () => {
 vi.useFakeTimers()
 try {
  vi.mocked(createComment).mockResolvedValueOnce({ error: 'Try again in 42 seconds.', retryAfterSeconds: 42 })
  render(<CommentForm postId="post-1" postSlug="first" authorName="Jane" />)
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: 'Keep this draft' } })
  await act(async () => { fireEvent.submit(input.closest('form')!) })
  const button = screen.getByRole('button', { name: /post comment/i })
  expect(button).toBeDisabled()
  expect(input).toHaveValue('Keep this draft')
  expect(input).not.toHaveAttribute('readonly')
  await act(async () => { fireEvent.submit(input.closest('form')!); await vi.advanceTimersByTimeAsync(41_999) })
  expect(createComment).toHaveBeenCalledTimes(1)
  expect(button).toBeDisabled()
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(button).toBeEnabled()
  await act(async () => { fireEvent.submit(input.closest('form')!) })
  expect(createComment).toHaveBeenCalledTimes(2)
  expect(vi.mocked(createComment).mock.calls[1][3]).toBe(vi.mocked(createComment).mock.calls[0][3])
  expect(input).toHaveValue('')
 } finally { vi.useRealTimers() }
})

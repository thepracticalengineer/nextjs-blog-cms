import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { publishPost, updatePost } from '@/features/posts/actions'
import { validPost } from '../helpers/publication'
import type { PostWithRelations } from '@/features/posts/types'
import { PostEditor } from '@/components/dashboard/PostEditor'

// ── Mock next/navigation ──────────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

// ── Mock server actions ───────────────────────────────────────────────────────
vi.mock('@/features/posts/actions', () => ({
  createPost: vi.fn(),
  updatePost: vi.fn(),
  publishPost: vi.fn(),
  unpublishPost: vi.fn(),
}))

// ── Mock sonner ───────────────────────────────────────────────────────────────
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// ── Mock TipTap Editor ────────────────────────────────────────────────────────
vi.mock('@/components/editor/Editor', () => ({
  Editor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <textarea aria-label="Article body" value={value} onChange={event => onChange(event.target.value)} />,
}))

const minimalProps = {
  categories: [],
  tags: [],
}

describe('PostEditor — back to top button', () => {
  beforeEach(() => {
    // Reset scroll position before each test
    Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: 0 })
  })

  afterEach(() => {
    Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: 0 })
  })

  it('does not show the back-to-top button at scroll position 0', () => {
    render(<PostEditor {...minimalProps} />)
    expect(screen.queryByRole('button', { name: /back to top/i })).not.toBeInTheDocument()
  })

  it('shows the back-to-top button after scrolling past 300px', () => {
    render(<PostEditor {...minimalProps} />)

    act(() => {
      Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: 301 })
      fireEvent.scroll(window)
    })

    expect(screen.getByRole('button', { name: /back to top/i })).toBeInTheDocument()
  })

  it('hides the back-to-top button when scrolling back above 300px', () => {
    render(<PostEditor {...minimalProps} />)

    act(() => {
      Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: 301 })
      fireEvent.scroll(window)
    })
    act(() => {
      Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: 100 })
      fireEvent.scroll(window)
    })

    expect(screen.queryByRole('button', { name: /back to top/i })).not.toBeInTheDocument()
  })

  it('calls window.scrollTo when the back-to-top button is clicked', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<PostEditor {...minimalProps} />)

    act(() => {
      Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: 301 })
      fireEvent.scroll(window)
    })

    fireEvent.click(screen.getByRole('button', { name: /back to top/i }))
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })

    scrollToSpy.mockRestore()
  })
})

const editorPost = { ...validPost, author: { id: 'user-1', full_name: 'Frank Mendez', avatar_url: null }, category: null, tags: [] } as PostWithRelations

describe('PostEditor publication readiness', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('shows the checklist and an unchecked editorial review confirmation', () => {
    render(<PostEditor {...minimalProps} post={editorPost} />)
    expect(screen.getByText(/At least 200 readable body words/)).toBeVisible()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
  it('preserves input and displays field errors when publication is blocked', async () => {
    vi.mocked(publishPost).mockResolvedValue({ error: 'Publication blocked', fieldErrors: { content: ['Write at least 200 readable words.'] } })
    render(<PostEditor {...minimalProps} post={editorPost} />)
    fireEvent.change(screen.getByLabelText('Article body'), { target: { value: '<p>My unfinished article</p>' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Write at least 200 readable words.'))
    expect(screen.getByLabelText('Article body')).toHaveValue('<p>My unfinished article</p>')
    expect(publishPost).toHaveBeenCalledWith('post-1', expect.objectContaining({ content: '<p>My unfinished article</p>', editorial_reviewed: true }))
    expect(updatePost).not.toHaveBeenCalled()
  })
  it('clears editorial confirmation when the author edits reviewed content', () => {
    render(<PostEditor {...minimalProps} post={editorPost} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('checkbox')).toBeChecked()
    fireEvent.change(screen.getByLabelText('Excerpt'), { target: { value: 'Changed excerpt' } })
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
  it('does not silently change an existing slug when the title loses focus', () => {
    render(<PostEditor {...minimalProps} post={editorPost} />)
    fireEvent.change(screen.getByLabelText('Post title'), { target: { value: 'A Different Useful Engineering Title' } })
    fireEvent.blur(screen.getByLabelText('Post title'))
    expect(screen.getByLabelText('Slug')).toHaveValue(validPost.slug)
  })
  it('preserves invalid live edits on the form while showing corrective errors', async () => {
    vi.mocked(updatePost).mockResolvedValue({ error: 'Publication blocked', fieldErrors: { title: ['Replace the placeholder title.'] } })
    render(<PostEditor {...minimalProps} post={{ ...editorPost, status: 'published' }} />)
    fireEvent.change(screen.getByLabelText('Post title'), { target: { value: 'hello this is for test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Replace the placeholder title.'))
    expect(screen.getByLabelText('Post title')).toHaveValue('hello this is for test')
  })
})


describe('editorial flags', () => {
  it('shows contextual unfinished-text warnings before review and keeps them visible after confirmation', () => {
    render(<PostEditor {...minimalProps} />)
    fireEvent.change(screen.getByLabelText('Article body'), { target: { value: 'Explain why TODO comments should be tracked.' } })
    expect(screen.getByRole('status')).toHaveTextContent('Review flagged text')
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('status')).toHaveTextContent('appropriate in context')
    fireEvent.change(screen.getByLabelText('Article body'), { target: { value: 'The article is complete.' } })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

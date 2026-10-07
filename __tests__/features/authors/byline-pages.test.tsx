import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import HomePage from '@/app/(public)/page'
import PostPage from '@/app/(public)/blog/[slug]/page'
import { getPostBySlug, getPublishedPosts } from '@/features/posts/queries'

vi.mock('@/features/posts/queries', () => ({ getPostBySlug: vi.fn(), getPublishedPosts: vi.fn(), getPopularTags: vi.fn().mockResolvedValue([]) }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }))
vi.mock('@/components/editor/EditorContent', () => ({ EditorContent: () => null }))
vi.mock('@/components/BackToTopButton', () => ({ BackToTopButton: () => null }))
vi.mock('@/features/comments/components/CommentSection', () => ({ CommentSection: () => null }))
vi.mock('@/components/ShareButton', () => ({ ShareButton: () => null }))
vi.mock('@/components/newsletter/SubscribeForm', () => ({ SubscribeForm: () => null }))
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, ...props }: React.ComponentProps<'span'>) => <span {...props}>{children}</span>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarImage: () => null,
}))

const post = {
  id: 'post', slug: 'engineering', title: 'Engineering', content: '', excerpt: null,
  published_at: null, updated_at: '2026-10-07', cover_image: null, category: null, tags: [],
  author: { id: 'author-1', full_name: 'Jane Doe', avatar_url: null },
}
beforeEach(() => {
  vi.mocked(getPostBySlug).mockResolvedValue(post as never)
  vi.mocked(getPublishedPosts).mockResolvedValue({ posts: [post], total: 1 } as never)
})

it('links article detail byline including its avatar to the public author', async () => {
  render(await PostPage({ params: Promise.resolve({ slug: post.slug }) }))
  const link = screen.getByRole('link', { name: 'Jane Doe' })
  expect(link).toHaveAttribute('href', '/authors/author-1')
  expect(link).toHaveTextContent('JD')
})

it('links feed and sidebar author names to the same public author', async () => {
  render(await HomePage({ searchParams: Promise.resolve({}) }))
  const links = screen.getAllByRole('link', { name: 'Jane Doe' })
  expect(links).toHaveLength(2)
  links.forEach(link => expect(link).toHaveAttribute('href', '/authors/author-1'))
})

it('handles deleted authors in public article details without broken links', async () => {
  vi.mocked(getPostBySlug).mockResolvedValue({ ...post, author: null } as never)
  render(await PostPage({ params: Promise.resolve({ slug: post.slug }) }))
  expect(screen.getByText('Unknown')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Jane Doe' })).not.toBeInTheDocument()
})

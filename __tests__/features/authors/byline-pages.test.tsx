import { beforeEach, expect, it, vi } from 'vitest'
import { redirect } from 'next/navigation'
import { render, screen } from '@testing-library/react'
import HomePage from '@/app/(public)/page'
import PostPage from '@/app/(public)/blog/[slug]/page'
import { getPublicAuthor, getAuthorLatestPosts } from '@/features/authors/queries'
import { getPostBySlug, getPublishedPosts } from '@/features/posts/queries'

vi.mock('@/features/authors/queries', () => ({ getPublicAuthor: vi.fn().mockResolvedValue(null), getAuthorLatestPosts: vi.fn().mockResolvedValue([]) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`) }) }))
vi.mock('@/features/posts/queries', () => ({ getPostBySlug: vi.fn(), getPublishedPosts: vi.fn(), getPopularTags: vi.fn().mockResolvedValue([]) }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }))
vi.mock('@/components/editor/EditorContent', () => ({ EditorContent: () => null }))
vi.mock('@/components/analytics/AnalyticsPage', () => ({ AnalyticsPage: () => null }))
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
  vi.mocked(getPublicAuthor).mockResolvedValue(null)
  vi.mocked(getAuthorLatestPosts).mockResolvedValue([])
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

it('sends stray auth codes to a safe login error without forwarding the code', async () => {
  await expect(HomePage({ searchParams: Promise.resolve({ code: 'private-code' }) })).rejects.toThrow('redirect:/login?error=auth_callback_failed')
  expect(redirect).toHaveBeenCalledWith('/login?error=auth_callback_failed')
})


it('introduces the audience and offers reader destinations without a public dashboard link', async () => {
  render(await HomePage({ searchParams: Promise.resolve({}) }))
  expect(screen.getByRole('heading', { level: 1, name: 'Build systems that survive production.' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Explore articles' })).toHaveAttribute('href', '/blog')
  expect(screen.getByRole('link', { name: 'Get new articles by email' })).toHaveAttribute('href', '#newsletter')
  expect(screen.queryByRole('link', { name: /Dashboard/ })).not.toBeInTheDocument()
  expect(document.querySelector('main')).toBeNull()
})

it('keeps the primary heading outside complementary landmarks', async () => {
  render(await HomePage({ searchParams: Promise.resolve({}) }))
  expect(screen.getByRole('heading', { level: 1 }).closest('aside')).toBeNull()
})

it('loads the article author public profile and renders their other articles', async () => {
  vi.mocked(getPublicAuthor).mockResolvedValue({ ...post.author, bio: 'Author biography' } as never)
  vi.mocked(getAuthorLatestPosts).mockResolvedValue([{ id: 'other', slug: 'other', title: 'Other article' }])
  render(await PostPage({ params: Promise.resolve({ slug: post.slug }) }))
  expect(getPublicAuthor).toHaveBeenCalledWith('author-1')
  expect(getAuthorLatestPosts).toHaveBeenCalledWith('author-1', 'post')
  expect(screen.getByRole('complementary', { name: 'About the author' })).toBeInTheDocument()
  expect(screen.getByText('Author biography')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Other article' })).toHaveAttribute('href', '/blog/other')
})

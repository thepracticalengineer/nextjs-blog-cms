import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AuthorPage, { generateMetadata } from '@/app/(public)/authors/[id]/page'
import { getPublicAuthor, getAuthorPublishedPosts } from '@/features/authors/queries'
import { AuthorByline } from '@/features/authors/components/AuthorByline'
import { publicWebUrl } from '@/features/authors/presentation'

vi.mock('@/features/authors/queries', () => ({
  getPublicAuthor: vi.fn(), getAuthorPublishedPosts: vi.fn(),
  parseAuthorPage: (value: unknown) => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : 1,
}))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') } }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }))
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, ...props }: React.ComponentProps<'span'>) => <span {...props}>{children}</span>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarImage: ({ alt, src }: { alt: string; src: string }) => <span data-src={src}>{alt}</span>,
}))
vi.mock('@/features/posts/components/PostList', () => ({
  PostList: ({ posts, showTags }: { posts: { id: string; title: string; slug: string }[]; showTags: boolean }) => <div data-tags={showTags}>{posts.map(post => <a href={`/blog/${post.slug}`} key={post.id}>{post.title}</a>)}</div>,
}))

const id = '5af2b64d-c7c0-465f-901f-75cf70737172'
const author = {
  id, full_name: 'Jane Doe', avatar_url: null, bio: '<script>unsafe</script>',
  website: 'https://example.com', twitter_url: 'javascript:alert(1)', linkedin_url: null,
  github_url: null, instagram_url: null, facebook_url: null, youtube_url: null, tiktok_url: null,
}
const props = (page?: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ page }) })

beforeEach(() => {
  vi.mocked(getPublicAuthor).mockResolvedValue(author)
  vi.mocked(getAuthorPublishedPosts).mockResolvedValue({ posts: [], total: 0 })
  vi.clearAllMocks()
})

describe('public author page', () => {
  it('renders safe public information, an empty state and validated external links', async () => {
    const { container } = render(await AuthorPage(props()))
    expect(screen.getByRole('heading', { name: 'Jane Doe' })).toBeInTheDocument()
    expect(screen.getByText('No published articles yet.')).toBeInTheDocument()
    expect(screen.getByText('0 articles')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Website/ })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.queryByRole('link', { name: /Twitter/ })).not.toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText('<script>unsafe</script>')).toBeInTheDocument()
    expect(getAuthorPublishedPosts).toHaveBeenCalledWith(id, 1, 12)
  })

  it('provides navigation and count for paginated posts', async () => {
    vi.mocked(getAuthorPublishedPosts).mockResolvedValue({ posts: [{ id: 'post', title: 'Engineering', slug: 'engineering' }] as never, total: 25 })
    render(await AuthorPage(props('2')))
    expect(screen.getByRole('link', { name: 'Engineering' })).toHaveAttribute('href', '/blog/engineering')
    expect(screen.getByText('25 articles')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Author article pagination' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Previous' })).toHaveAttribute('href', `/authors/${id}?page=1`)
    expect(screen.getByRole('link', { name: 'Next →' })).toHaveAttribute('href', `/authors/${id}?page=3`)
    expect(getAuthorPublishedPosts).toHaveBeenCalledWith(id, 2, 12)
  })

  it('lets readers recover from an out of range page', async () => {
    vi.mocked(getAuthorPublishedPosts).mockResolvedValue({ posts: [], total: 13 })
    render(await AuthorPage(props('9')))
    expect(screen.getByText('No articles on this page.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to first page' })).toHaveAttribute('href', `/authors/${id}`)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('returns not found for a missing profile in content and metadata', async () => {
    vi.mocked(getPublicAuthor).mockResolvedValue(null)
    await expect(AuthorPage(props())).rejects.toThrow('NOT_FOUND')
    await expect(generateMetadata(props())).rejects.toThrow('NOT_FOUND')
    expect(getAuthorPublishedPosts).not.toHaveBeenCalled()
  })

  it('provides stable canonical metadata and a fallback for unnamed authors', async () => {
    vi.mocked(getPublicAuthor).mockResolvedValue({ ...author, full_name: null, bio: null })
    expect(await generateMetadata(props())).toEqual({ title: 'Author — Author', description: 'Read published articles by Author on The Practical Engineer.', alternates: { canonical: `http://localhost:3000/authors/${id}` } })
    render(await AuthorPage(props()))
    expect(screen.getByRole('heading', { name: 'Author' })).toBeInTheDocument()
  })
})

describe('public author byline', () => {
  it('links the name and avatar together using the immutable identifier', () => {
    render(<AuthorByline author={author} showAvatar />)
    const link = screen.getByRole('link', { name: /Jane Doe/ })
    expect(link).toHaveAttribute('href', `/authors/${id}`)
    expect(link).toHaveClass('focus-visible:outline-2')
    expect(link).toHaveTextContent('JD')
  })
  it('does not expose a legacy email for an unnamed author', () => {
    const legacyAuthor = { ...author, full_name: null, email: 'private@example.com' }
    render(<AuthorByline author={legacyAuthor} />)
    expect(screen.getByRole('link', { name: 'Author' })).toHaveAttribute('href', `/authors/${id}`)
    expect(screen.queryByText('private@example.com')).not.toBeInTheDocument()
  })
  it('renders deleted authors without a broken link', () => {
    render(<AuthorByline author={null} showAvatar />)
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
  it.each(['javascript:alert(1)', 'data:text/html,unsafe', '/relative', 'https://user:pass@example.com'])('rejects unsafe link %s', value => {
    expect(publicWebUrl(value)).toBeNull()
  })
})

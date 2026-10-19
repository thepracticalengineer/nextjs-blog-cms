import { expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { AuthorSidebar } from '@/features/authors/components/AuthorSidebar'
import type { PublicAuthor } from '@/features/authors/types'

vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }))
const author: PublicAuthor = {
  id: 'author', full_name: 'Jane Doe', avatar_url: null, bio: 'Engineering guides.',
  website: 'https://example.com', twitter_url: null, linkedin_url: null, github_url: 'javascript:alert(1)',
  instagram_url: null, facebook_url: null, youtube_url: null, tiktok_url: null,
}
it.each([0, 1, 2])('renders the author and %s other posts with linked titles', (count) => {
  const posts = [
    { id: 'one', title: 'First article', slug: 'first' },
    { id: 'two', title: 'Second article', slug: 'second' },
  ].slice(0, count)
  render(<AuthorSidebar author={author} posts={posts} />)
  const sidebar = screen.getByRole('complementary', { name: 'About the author' })
  expect(within(sidebar).getByRole('link', { name: 'Jane Doe' })).toHaveAttribute('href', '/authors/author')
  expect(within(sidebar).getByText('Engineering guides.')).toBeInTheDocument()
  expect(within(sidebar).getByText('JD')).toBeInTheDocument()
  expect(within(sidebar).getByRole('link', { name: /Website/ })).toHaveAttribute('href', 'https://example.com/')
  expect(within(sidebar).queryByRole('link', { name: /GitHub/ })).toBeNull()
  if (count) {
    expect(within(sidebar).getByRole('heading', { name: 'More from Jane Doe' })).toBeInTheDocument()
    expect(within(sidebar).getByRole('link', { name: 'First article' })).toHaveAttribute('href', '/blog/first')
    expect(within(sidebar).getAllByRole('listitem')).toHaveLength(count + 1)
  } else expect(within(sidebar).queryByRole('heading', { name: /More from/ })).toBeNull()
})
it('uses name/avatar fallbacks and omits empty optional fields', () => {
  render(<AuthorSidebar author={{ ...author, full_name: ' ', bio: ' ', website: null }} posts={[]} />)
  expect(screen.getByRole('link', { name: 'Author' })).toHaveAttribute('href', '/authors/author')
  expect(screen.getByText('A')).toBeInTheDocument()
  expect(screen.queryByRole('list')).toBeNull()
  expect(screen.queryByText('Engineering guides.')).toBeNull()
})

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Sidebar } from '@/components/dashboard/Sidebar'
import type { Profile } from '@/lib/supabase/types'

let pathname = '/dashboard'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
// eslint-disable-next-line @next/next/no-img-element -- Native image stand-in for Next in jsdom.
vi.mock('next/image', () => ({ default: (props: React.ComponentProps<'img'>) => <img {...props} alt={props.alt} /> }))
vi.mock('@/components/auth/use-signout', () => ({ useSignOut: () => ({ handleSignOut: vi.fn(), signingOut: false, signOutError: null }) }))
const profile = (role: string) => ({ id: 'user', email: 'author@example.test', full_name: 'Test Author', role, avatar_url: null }) as Profile
beforeEach(() => { pathname = '/dashboard' })
afterEach(cleanup)

it('opens the ordered admin submenu with keyboard and removes collapsed links from tab order', async () => {
  const user = userEvent.setup()
  render(<Sidebar profile={profile('admin')} />)
  const toggle = screen.getByRole('button', { name: 'Posts' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('link', { name: 'All Posts' })).not.toBeInTheDocument()
  toggle.focus()
  await user.keyboard('{Enter}')
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const submenu = document.getElementById(toggle.getAttribute('aria-controls')!)!
  expect(within(submenu).getAllByRole('link').map(link => [link.textContent, link.getAttribute('href')])).toEqual([
    ['All Posts', '/dashboard/posts'], ['Add Post', '/dashboard/posts/new'],
    ['Categories', '/dashboard/admin/categories'], ['Tags', '/dashboard/admin/tags'],
  ])
  await user.tab()
  expect(screen.getByRole('link', { name: 'All Posts' })).toHaveFocus()
  toggle.focus()
  await user.keyboard(' ')
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await user.tab()
  expect(screen.getByRole('link', { name: 'Pages' })).toHaveFocus()
})

it.each(['author', 'unknown'])('hides taxonomy links for %s', async role => {
  render(<Sidebar profile={profile(role)} />)
  const toggle = screen.queryByRole('button', { name: 'Posts' })
  if (toggle) await userEvent.click(toggle)
  expect(screen.queryByRole('link', { name: 'Categories' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Tags' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Pages' })).not.toBeInTheDocument()
  if (role === 'author') {
    expect(screen.getByRole('link', { name: 'Add Post' })).toHaveAttribute('href', '/dashboard/posts/new')
  } else {
    expect(toggle).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add Post' })).not.toBeInTheDocument()
  }
})

it.each([
  ['/dashboard/posts', 'All Posts'],
  ['/dashboard/posts/new', 'Add Post'],
  ['/dashboard/posts/123/edit', 'All Posts'],
  ['/dashboard/admin/categories', 'Categories'],
  ['/dashboard/admin/tags', 'Tags'],
])('expands and marks exactly one child on direct navigation to %s', (path, label) => {
  pathname = path
  render(<Sidebar profile={profile('admin')} />)
  expect(screen.getByRole('button', { name: 'Posts' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
  expect(document.querySelectorAll('a[aria-current="page"]')).toHaveLength(1)
})

it('allows collapse on a child, preserves it on rerender, and reopens on child navigation', async () => {
  pathname = '/dashboard/posts'
  const { rerender } = render(<Sidebar profile={profile('admin')} />)
  const toggle = screen.getByRole('button', { name: 'Posts' })
  await userEvent.click(toggle)
  rerender(<Sidebar profile={profile('admin')} />)
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  pathname = '/dashboard/admin/tags'
  rerender(<Sidebar profile={profile('admin')} />)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('link', { name: 'Tags' })).toHaveAttribute('aria-current', 'page')
})

it('does not match unrelated route prefixes', () => {
  pathname = '/dashboard/posts-archive'
  render(<Sidebar profile={profile('admin')} />)
  expect(screen.getByRole('button', { name: 'Posts' })).toHaveAttribute('aria-expanded', 'false')
})

it('marks Pages active on its editor route', () => {
  pathname = '/dashboard/pages/123/edit'
  render(<Sidebar profile={profile('admin')} />)
  expect(screen.getByRole('link', { name: 'Pages' })).toHaveAttribute('aria-current', 'page')
})

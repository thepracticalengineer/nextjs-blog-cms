import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostTable } from '@/components/dashboard/PostTable'

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/features/posts/bulk-actions', () => ({ bulkPostAction: vi.fn() }))
vi.mock('@/features/posts/actions', () => ({ unpublishPost: vi.fn(), deletePost: vi.fn() }))

const state = { search: 'applied', category: null, sort: 'title' as const, direction: 'asc' as const, page: 2, pageSize: 10 }
function setup() {
  render(<PostTable posts={[]} total={30} categories={[]} state={state} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Search posts' }), { target: { value: ' unsubmitted ' } })
}

describe('dashboard search submission', () => {
  beforeEach(() => push.mockClear())
  it('keeps the applied search when paging with unsubmitted text', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    const url = new URL(push.mock.calls[0][0], 'http://localhost')
    expect(url.searchParams.get('q')).toBe('applied')
    expect(url.searchParams.get('page')).toBe('3')
  })
  it('applies trimmed text and resets the page only on search submit', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    const url = new URL(push.mock.calls[0][0], 'http://localhost')
    expect(url.searchParams.get('q')).toBe('unsubmitted')
    expect(url.searchParams.has('page')).toBe(false)
  })
})

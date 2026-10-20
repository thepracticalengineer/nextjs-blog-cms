import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostTable } from '@/components/dashboard/PostTable'
import { bulkPostAction } from '@/features/posts/bulk-actions'
import type { DashboardPostSummary } from '@/features/posts/types'
const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
vi.mock('@/features/posts/actions', () => ({ unpublishPost: vi.fn(), deletePost: vi.fn() }))
vi.mock('@/features/posts/bulk-actions', () => ({ bulkPostAction: vi.fn() }))
const posts = [
  { id: 'one', title: 'Published post', status: 'published', updated_at: '2026-10-20', author: null, tags: [] },
  { id: 'two', title: 'Draft post', status: 'draft', updated_at: '2026-10-20', author: null, tags: [] },
] as unknown as DashboardPostSummary[]
const state = { search: '', category: null, sort: 'title' as const, direction: 'asc' as const, page: 1, pageSize: 10 }
function setup() { return render(<PostTable posts={posts} total={2} categories={[]} state={state} />) }
beforeEach(() => vi.resetAllMocks())
describe('bulk post selection', () => {
  it('selects the page, supports partial selection and clears selection', () => {
    setup()
    const all = screen.getByRole('checkbox', { name: 'Select all posts on this page' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Published post' }))
    expect(all).toBePartiallyChecked()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    fireEvent.click(all)
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(all).not.toBeChecked()
    expect(screen.queryByRole('button', { name: 'Delete selected' })).not.toBeInTheDocument()
  })
  it('disables unpublish for drafts and cancellation preserves selection', () => {
    setup()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Draft post' }))
    expect(screen.getByRole('button', { name: 'Unpublish selected' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Delete 1 post')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(bulkPostAction).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Select Draft post' })).toBeChecked()
  })
  it('reports mixed outcomes, refreshes and keeps only failed posts selected', async () => {
    setup()
    vi.mocked(bulkPostAction).mockResolvedValue({ results: [{ id: 'one', status: 'success' }, { id: 'two', status: 'failed', message: 'Post changed' }] })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all posts on this page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete 2 posts' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select Published post' })).not.toBeChecked())
    expect(screen.getByRole('checkbox', { name: 'Select Draft post' })).toBeChecked()
    expect(screen.getByText(/1 successful, 0 skipped, 1 failed/)).toBeInTheDocument()
    expect(refresh).toHaveBeenCalledOnce()
  })
  it('preserves selection after a rejected action', async () => {
    setup()
    vi.mocked(bulkPostAction).mockResolvedValue({ error: 'Unauthorized' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Draft post' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete 1 post' }))
    await waitFor(() => expect(screen.getByText('Unauthorized')).toBeInTheDocument())
    expect(screen.getByRole('checkbox', { name: 'Select Draft post' })).toBeChecked()
    expect(refresh).not.toHaveBeenCalled()
  })
  it('refreshes uncertain network outcomes while keeping rows available for review', async () => {
    setup()
    vi.mocked(bulkPostAction).mockRejectedValue(new Error('Connection lost'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Draft post' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete 1 post' }))
    await waitFor(() => expect(screen.getByText(/Results could not be confirmed/)).toBeInTheDocument())
    expect(screen.getByRole('checkbox', { name: 'Select Draft post' })).toBeChecked()
    expect(refresh).toHaveBeenCalledOnce()
  })
  it('submits mixed-status unpublish and prevents duplicate submissions while pending', async () => {
    setup()
    let resolve!: (value: Awaited<ReturnType<typeof bulkPostAction>>) => void
    vi.mocked(bulkPostAction).mockReturnValue(new Promise(r => { resolve = r }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all posts on this page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish selected' }))
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Unpublish 1 post' })
    fireEvent.click(confirm); fireEvent.click(confirm)
    expect(bulkPostAction).toHaveBeenCalledOnce()
    expect(bulkPostAction).toHaveBeenCalledWith('unpublish', posts.map(p => ({ id: p.id, updatedAt: p.updated_at })))
    resolve({ results: [{ id: 'one', status: 'success' }, { id: 'two', status: 'skipped' }] })
    await waitFor(() => expect(screen.getByText(/1 successful, 1 skipped, 0 failed/)).toBeInTheDocument())
  })
})

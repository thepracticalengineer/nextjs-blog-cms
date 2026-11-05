import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ write: vi.fn(), refresh: vi.fn() }))
vi.mock('@/features/pages/actions', () => ({ writePage: mocks.write }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
import { TrashActions } from '@/features/pages/management/TrashActions'
const id = '29010000-0000-4000-8000-000000000001'
const page = { id, title: 'Old', slug: 'old-page', revision: id }
beforeEach(() => { vi.clearAllMocks(); mocks.write.mockResolvedValue({ data: { page: {}, replayed: false }, error: null }) })
it('restores with the listed revision and refreshes the list', async () => {
  render(<TrashActions accountId={id} page={page} />)
  fireEvent.click(screen.getByRole('button', { name: /Restore/ }))
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
  expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ operation: 'recover', pageId: id, expectedRevision: id }), id)
})
it('permanently deletes only when the slug is typed exactly', async () => {
  const prompt = vi.spyOn(window, 'prompt')
  render(<TrashActions accountId={id} page={page} />)
  prompt.mockReturnValueOnce(null)
  fireEvent.click(screen.getByRole('button', { name: /Delete permanently/ }))
  prompt.mockReturnValueOnce('old')
  fireEvent.click(screen.getByRole('button', { name: /Delete permanently/ }))
  expect(await screen.findByText(/did not match/)).toBeInTheDocument()
  expect(mocks.write).not.toHaveBeenCalled()
  prompt.mockReturnValueOnce('old-page')
  fireEvent.click(screen.getByRole('button', { name: /Delete permanently/ }))
  await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce())
  expect(mocks.write.mock.calls[0][0]).toMatchObject({ operation: 'purge', confirmSlug: 'old-page', expectedRevision: id })
})
it('retries the identical purge request after a lost response without asking again', async () => {
  const prompt = vi.spyOn(window, 'prompt').mockReturnValue('old-page')
  mocks.write.mockRejectedValueOnce(new Error('lost'))
  render(<TrashActions accountId={id} page={page} />)
  fireEvent.click(screen.getByRole('button', { name: /Delete permanently/ }))
  expect(await screen.findByText(/could not be confirmed/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Delete permanently/ }))
  await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(2))
  expect(mocks.write.mock.calls[1][0]).toEqual(mocks.write.mock.calls[0][0])
  expect(prompt).toHaveBeenCalledOnce()
})
it('shows database refusals such as children or stale revisions', async () => {
  mocks.write.mockResolvedValue({ data: null, error: { code: 'PAGE_STALE', message: 'This page changed elsewhere.' } })
  render(<TrashActions accountId={id} page={page} />)
  fireEvent.click(screen.getByRole('button', { name: /Restore/ }))
  expect(await screen.findByText('This page changed elsewhere.')).toBeInTheDocument()
  expect(mocks.refresh).not.toHaveBeenCalled()
})

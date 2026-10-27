import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MediaLibrary } from '@/features/posts/media/components/MediaLibrary'
import { MediaUploads } from '@/features/posts/media/components/MediaUploads'
import { uploadImage } from '@/features/posts/media/client'
vi.mock('@/features/posts/media/client', () => ({ uploadImage: vi.fn() }))
const auth = vi.hoisted(() => ({ user: { id: 'owner-a' } as { id: string } | null, loading: false }))
vi.mock('@/features/auth/context/AuthContext', () => ({ useAuth: () => auth }))
const asset = { id: 'asset-a', url: 'https://example.test/a.webp', original_filename: 'circuit.png', title: 'Circuit', alt_text: 'A circuit board', caption: '', description: '', width: 800, height: 600, byte_size: 1024, uploaded_at: null, archived_at: null }
const fetcher = vi.fn()
beforeEach(() => { auth.user = { id: 'owner-a' }; vi.resetAllMocks(); vi.stubGlobal('fetch', fetcher); fetcher.mockResolvedValue(Response.json({ assets: [asset], total: 1, page: 1, pageSize: 24 })) })
it('browses in original account context and pins an image before returning defaults', async () => {
  const select = vi.fn()
  render(<MediaLibrary editorId="owner-a" onSelect={select} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Select Circuit' }))
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  expect(String(fetcher.mock.calls[0][0])).toContain('editorId=owner-a')
  expect(fetcher.mock.calls[1][0]).toBe('/api/post-media/library/asset-a/select')
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ editorId: 'owner-a' })
  expect(select).not.toHaveBeenCalled() // malformed selection response cannot insert an image
})
it('copies defaults only after successful selection', async () => {
  const select = vi.fn()
  fetcher.mockResolvedValueOnce(Response.json({ assets: [asset], total: 1, page: 1, pageSize: 24 })).mockResolvedValueOnce(Response.json({ asset }))
  render(<MediaLibrary editorId="owner-a" onSelect={select} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Select Circuit' }))
  await waitFor(() => expect(select).toHaveBeenCalledWith(asset))
})
it('shows account-change errors without stale assets and supports retry', async () => {
  fetcher.mockResolvedValueOnce(Response.json({ error: 'The signed-in account changed.' }, { status: 403 }))
  render(<MediaLibrary editorId="owner-a" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('account changed')
  expect(screen.queryByRole('button', { name: 'Open Circuit' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading media' }))
  expect(await screen.findByRole('button', { name: 'Open Circuit' })).toBeVisible()
})
it('preserves a failed upload for retry and marks library intent', async () => {
  vi.mocked(uploadImage).mockRejectedValueOnce(new Error('Network failed')).mockResolvedValueOnce({ src: asset.url, alt: '' })
  render(<MediaUploads editorId="owner-a" onUploaded={vi.fn()} />)
  const file = new File(['bytes'], 'circuit.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText('Upload images'), { target: { files: [file] } })
  expect(await screen.findByText('Network failed')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Retry circuit.png' }))
  await waitFor(() => expect(screen.getByText('Uploaded')).toBeVisible())
  expect(uploadImage).toHaveBeenLastCalledWith(file, 'owner-a', expect.any(Function), expect.any(AbortSignal), 'library')
})
it('clears a populated library immediately when the authenticated account changes', async () => {
  const { rerender } = render(<MediaLibrary editorId="owner-a" />)
  expect(await screen.findByRole('button', { name: 'Open Circuit' })).toBeVisible()
  auth.user = { id: 'owner-b' }
  rerender(<MediaLibrary editorId="owner-a" />)
  expect(screen.queryByRole('button', { name: 'Open Circuit' })).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('account changed')
})

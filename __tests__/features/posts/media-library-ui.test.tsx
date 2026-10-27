import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MediaLibrary } from '@/features/posts/media/components/MediaLibrary'
import { MediaDetails } from '@/features/posts/media/components/MediaDetails'
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

it('explains archived duplicate uploads and offers their restore details', async () => {
  vi.mocked(uploadImage).mockResolvedValueOnce({ src: asset.url, alt: '', archived: true, assetId: asset.id })
  render(<MediaUploads editorId="owner-a" onUploaded={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Upload images'), { target: { files: [new File(['bytes'], 'circuit.png', { type: 'image/png' })] } })
  expect(await screen.findByText('Already in your archive. Restore it to use it again.')).toBeVisible()
  expect(screen.queryByText('Uploaded')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Open archived image circuit.png' })).toBeEnabled()
})
it('retains a transient image before showing a copyable URL in details', async () => {
  let finish!: (value: Response) => void
  fetcher.mockResolvedValueOnce(Response.json({ asset })).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<MediaDetails id={asset.id} editorId="owner-a" onClose={vi.fn()} onChanged={vi.fn()} />)
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  expect(screen.queryByLabelText('Public image URL')).not.toBeInTheDocument()
  expect(fetcher.mock.calls[1][0]).toBe('/api/post-media/library/asset-a/select')
  finish(Response.json({ asset }))
  expect(await screen.findByLabelText('Public image URL')).toHaveValue(asset.url)
})
it('does not expose a copyable URL when retention loses to cleanup', async () => {
  fetcher.mockResolvedValueOnce(Response.json({ asset })).mockResolvedValueOnce(Response.json({ error: 'Image not found or unavailable.' }, { status: 404 }))
  render(<MediaDetails id={asset.id} editorId="owner-a" onClose={vi.fn()} onChanged={vi.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Image not found')
  expect(screen.queryByLabelText('Public image URL')).not.toBeInTheDocument()
})
it('opens an archived image without trying to select or restore it', async () => {
  fetcher.mockResolvedValueOnce(Response.json({ asset: { ...asset, archived_at: '2026-10-27T00:00:00Z' } }))
  render(<MediaDetails id={asset.id} editorId="owner-a" onClose={vi.fn()} onChanged={vi.fn()} />)
  expect(await screen.findByLabelText('Public image URL')).toHaveValue(asset.url)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Restore image' })).toBeEnabled()
})
it('uses the same nonblank display name as title sorting', async () => {
  const { assetName } = await import('@/features/posts/media/library-client')
  expect(assetName({ ...asset, title: '   ', original_filename: ' circuit.png ' })).toBe('circuit.png')
  expect(assetName({ ...asset, title: '', original_filename: ' ' })).toBe('Untitled image')
})

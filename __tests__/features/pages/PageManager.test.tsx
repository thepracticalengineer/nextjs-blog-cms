import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageManager } from '@/features/pages/management/PageManager'
import type { Page, PageWrite } from '@/features/pages/schema'
const id = '28800000-0000-4000-8000-000000000001'
const mocks = vi.hoisted(() => ({ write: vi.fn(), get: vi.fn(), push: vi.fn(), user: { id: '28800000-0000-4000-8000-000000000001' } }))
vi.mock('@/features/pages/actions', () => ({ writePage: mocks.write, getPage: mocks.get }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/features/auth/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }))
vi.mock('@/features/pages/editor/PageEditor', () => ({ PageEditor: () => <div>Canvas</div> }))
vi.mock('@/features/posts/drafts/navigation', () => ({ installNavigationGuard: () => ({ dispose() {}, sync() {} }) }))
const page: Page = { id, revision: id, status: 'draft', title: 'About', slug: 'about', seo_title: '', seo_description: '', document: { version: 1, blocks: [{ type: 'paragraph', text: 'Hello' }] }, created_at: '', updated_at: '', created_by: id, updated_by: id, published_at: null, published_by: null }
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); mocks.user.id = id; vi.spyOn(window, 'confirm').mockReturnValue(true); mocks.write.mockImplementation(async (request: PageWrite) => ({ data: { page: { ...page, ...('values' in request ? request.values : {}), status: request.operation === 'publish' ? 'published' : 'draft' }, replayed: false }, error: null })) })
async function mount(initialPage: Page | null = page) { const view = render(<PageManager accountId={id} documentId={id} initialPage={initialPage} />); await waitFor(() => expect(screen.getByRole('button', { name: 'Save Draft' })).toBeEnabled()); return view }
describe('page management workflow', () => {
  it('requires explicit review of a saved revision and resets it on input changes', async () => {
    await mount()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Title', { exact: true }), { target: { value: 'Changed' } })
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce())
    expect(mocks.write.mock.calls[0][0].operation).toBe('save')
  })
  it('recovers a lost create acknowledgement after reload using the identical key and payload', async () => {
    mocks.write.mockRejectedValueOnce(new Error('lost response'))
    const view = await mount(null)
    fireEvent.change(screen.getByLabelText('Title', { exact: true }), { target: { value: 'About' } })
    fireEvent.change(screen.getByLabelText('URL slug'), { target: { value: 'about' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    await screen.findByText(/result could not be confirmed/)
    const request = mocks.write.mock.calls[0][0]
    view.unmount()
    render(<PageManager accountId={id} documentId={id} initialPage={null} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Recover About/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry previous request' }))
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(2))
    expect(mocks.write.mock.calls[1][0]).toEqual(request)
    await screen.findByText(/Draft saved/)
    expect(screen.getByLabelText('Title', { exact: true })).toHaveValue('About')
  })
  it('preserves input after stale saves and hides it if the current account changes', async () => {
    mocks.write.mockResolvedValue({ data: null, error: { code: 'PAGE_STALE', message: 'Changed elsewhere. Load latest.' } })
    const view = await mount()
    fireEvent.change(screen.getByLabelText('Title', { exact: true }), { target: { value: 'My input' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    await screen.findByText(/Changed elsewhere/)
    expect(screen.getByLabelText('Title', { exact: true })).toHaveValue('My input')
    mocks.user.id = '28800000-0000-4000-8000-000000000002'
    view.rerender(<PageManager accountId={id} documentId={id} initialPage={page} />)
    expect(screen.queryByLabelText('Title', { exact: true })).not.toBeInTheDocument()
  })
  it('does not replace input or allow implicit overwrite when replay returns later content', async () => {
    mocks.write.mockResolvedValue({ data: { page: { ...page, title: 'Other editor' }, replayed: true }, error: null })
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    await screen.findByText(/This retry returned a newer/)
    expect(screen.getByLabelText('Title', { exact: true })).toHaveValue('About')
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled()
  })
  it('blocks dispatch if exact retry identity cannot be stored', async () => {
    await mount()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    await screen.findByText(/recovery could not be written/)
    expect(mocks.write).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

it('retains a lost request through authentication outages', async () => {
  mocks.write.mockRejectedValueOnce(new Error('lost'))
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  await screen.findByText(/result could not be confirmed/)
  const request = mocks.write.mock.calls[0][0]
  mocks.write.mockResolvedValueOnce({ data: null, error: { code: 'AUTH_UNAVAILABLE', message: 'Authentication unavailable' } })
  fireEvent.click(screen.getByRole('button', { name: 'Retry previous request' }))
  await screen.findByText('Authentication unavailable')
  expect(screen.getByRole('button', { name: 'Retry previous request' })).toBeEnabled()
  expect(mocks.write.mock.calls[1][0]).toEqual(request)
})
it('will not replace current input if its recovery copy cannot be persisted', async () => {
  await mount()
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Only copy' } })
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  fireEvent.click(screen.getByRole('button', { name: 'Load latest saved page' }))
  await screen.findByText(/recovery could not be written/)
  expect(mocks.get).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Title')).toHaveValue('Only copy')
  spy.mockRestore()
})

it('retains reconciliation protection after reload and recovery of a newer replay', async () => {
  mocks.write.mockResolvedValue({ data: { page: { ...page, title: 'Other editor', revision: '28800000-0000-4000-8000-000000000002' }, replayed: true }, error: null })
  const view = await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  await screen.findByText(/This retry returned a newer/)
  view.unmount()
  render(<PageManager accountId={id} documentId={id} initialPage={page} />)
  fireEvent.click(await screen.findByRole('button', { name: /^Recover About/ }))
  expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled()
  expect(screen.getByLabelText('Title')).toHaveValue('About')
})

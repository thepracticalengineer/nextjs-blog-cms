import { cleanup as cleanupDom, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageManager } from '@/features/pages/management/PageManager'
import type { Page, PageWrite } from '@/features/pages/schema'
const id = '28800000-0000-4000-8000-000000000001'
const mocks = vi.hoisted(() => ({ write: vi.fn(), get: vi.fn(), list: vi.fn(), revision: vi.fn(), tree: vi.fn(), push: vi.fn(), user: { id: '28800000-0000-4000-8000-000000000001' } }))
vi.mock('@/features/pages/actions', () => ({ writePage: mocks.write, getPage: mocks.get, listPageRevisions: mocks.list, getPageRevision: mocks.revision, listPageTree: mocks.tree }))
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
    await screen.findByText(/This retry needs reconciliation/)
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
  await screen.findByText(/This retry needs reconciliation/)
  view.unmount()
  render(<PageManager accountId={id} documentId={id} initialPage={page} />)
  fireEvent.click(await screen.findByRole('button', { name: /^Recover About/ }))
  expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled()
  expect(screen.getByLabelText('Title')).toHaveValue('About')
})

it('unlocks rejected image input on its first attempt and preserves it for correction', async () => {
  mocks.write.mockResolvedValueOnce({ data: null, error: { code: 'PAGE_IMAGE_NOT_ALLOWED', message: 'Replace this image.', writeAttempted: false } })
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  await screen.findByText('Replace this image.')
  expect(screen.getByLabelText('Title')).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Retry previous request' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save Draft' })).toBeEnabled()
  expect(screen.getByLabelText('Title')).toHaveValue('About')
})
it.each([undefined, false])('keeps image failures unresolved after a lost acknowledgement (writeAttempted=%s)', async writeAttempted => {
  mocks.write.mockRejectedValueOnce(new Error('lost'))
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  await screen.findByText(/result could not be confirmed/)
  const request = mocks.write.mock.calls[0][0]
  mocks.write.mockResolvedValueOnce({ data: null, error: { code: 'PAGE_IMAGE_NOT_ALLOWED', message: 'Blocked host.', writeAttempted } })
  fireEvent.click(screen.getByRole('button', { name: 'Retry previous request' }))
  await screen.findByText(/An earlier write may have completed/)
  expect(screen.getByRole('button', { name: 'Retry previous request' })).toBeEnabled()
  expect(mocks.write.mock.calls[1][0]).toEqual(request)
  expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled()
})
it('does not clear a post-write image failure even on the first attempt', async () => {
  mocks.write.mockResolvedValueOnce({ data: null, error: { code: 'PAGE_IMAGE_NOT_ALLOWED', message: 'Blocked result host.' } })
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  await screen.findByText(/An earlier write may have completed/)
  expect(screen.getByRole('button', { name: 'Retry previous request' })).toBeEnabled()
})
it.each(['PAGE_SLUG_CONFLICT', 'PAGE_IMAGE_NOT_ALLOWED', 'PAGE_FORBIDDEN'])('shows a rejected duplicate %s without navigating into a stuck copy', async code => {
  mocks.write.mockResolvedValueOnce({ data: null, error: { code, message: 'Duplicate was rejected.', writeAttempted: false } })
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
  await screen.findByText('Duplicate was rejected.')
  expect(mocks.push).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Save Draft' })).toBeEnabled()
  const copies = Object.keys(localStorage).map(key => JSON.parse(localStorage.getItem(key)!))
  const duplicate = copies.find(copy => copy.values.slug.startsWith('copy-'))
  expect(duplicate.pending).toBeNull()
})

describe('revision history', () => {
  const source = '28800000-0000-4000-8000-000000000009'
  const older = { ...page, id: source, page_id: id, revision: source, operation: 'create' as const, status: 'draft' as const, restored_from: null, created_at: '2026-10-28T00:00:00Z', title: 'Old about', document: { version: 1 as const, blocks: [{ type: 'paragraph' as const, text: 'Earlier' }] } }
  const summaries = [
    { id, revision: id, operation: 'save', title: 'About', slug: 'about', status: 'draft', restored_from: null, created_by: id, author_name: 'Frank', created_at: '2026-10-29T00:00:00Z' },
    { id: source, revision: source, operation: 'create', title: 'Old about', slug: 'about', status: 'draft', restored_from: null, created_by: null, author_name: null, created_at: '2026-10-28T00:00:00Z' },
  ]
  beforeEach(() => {
    mocks.list.mockResolvedValue({ data: summaries, error: null })
    mocks.revision.mockResolvedValue({ data: older, error: null })
    mocks.write.mockImplementation(async (request: PageWrite) => ({ data: { page: { ...page, revision: '28800000-0000-4000-8000-00000000000a', title: request.operation === 'restore' ? older.title : page.title, document: request.operation === 'restore' ? older.document : page.document }, replayed: false }, error: null }))
  })
  async function openHistory() {
    await mount()
    const panel = screen.getByText('Revision history').closest('details')!
    panel.open = true
    fireEvent(panel, new Event('toggle'))
    await screen.findByRole('button', { name: /Draft saved/ })
  }
  it('loads only when opened and compares a revision with the saved draft', async () => {
    await mount()
    expect(mocks.list).not.toHaveBeenCalled()
    cleanupDom()
    await openHistory()
    expect(screen.getByRole('button', { name: /Draft saved.*Frank.*current draft/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Created.*Deleted account/ }))
    expect(await screen.findByText('− Hello')).toBeInTheDocument()
    expect(screen.getByText('+ Earlier')).toBeInTheDocument()
    expect(mocks.revision).toHaveBeenCalledWith(id, source)
  })
  it('restores into the working draft only after confirmation and without publishing', async () => {
    await openHistory()
    fireEvent.click(screen.getByRole('button', { name: /Created/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Restore as working draft' }))
    await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce())
    expect(mocks.write.mock.calls[0][0]).toMatchObject({ operation: 'restore', pageId: id, expectedRevision: id, sourceRevision: source })
    expect(await screen.findByText(/Revision restored as the working draft/)).toBeInTheDocument()
    expect(screen.getByLabelText('Title', { exact: true })).toHaveValue('Old about')
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
  })
  it('blocks restore while there are unsaved changes', async () => {
    await openHistory()
    fireEvent.change(screen.getByLabelText('Title', { exact: true }), { target: { value: 'Unsaved' } })
    fireEvent.click(screen.getByRole('button', { name: /Created/ }))
    expect(await screen.findByRole('button', { name: 'Restore as working draft' })).toBeDisabled()
  })
  it('does nothing when restore is not confirmed', async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    await openHistory()
    fireEvent.click(screen.getByRole('button', { name: /Created/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Restore as working draft' }))
    expect(mocks.write).not.toHaveBeenCalled()
  })
})

describe('trash and hierarchy in the editor', () => {
  const parent = '28800000-0000-4000-8000-0000000000aa'
  const sibling = '28800000-0000-4000-8000-0000000000bb'
  beforeEach(() => {
    mocks.tree.mockResolvedValue({ data: [
      { id, title: 'About', slug: 'about', parent_id: null, position: 0 },
      { id: parent, title: 'Company', slug: 'company', parent_id: null, position: 1 },
      { id: sibling, title: 'Team', slug: 'team', parent_id: parent, position: 0 },
    ], error: null })
    mocks.write.mockImplementation(async (request: PageWrite) => ({ data: { page: { ...page, revision: '28800000-0000-4000-8000-00000000000c',
      ...(request.operation === 'trash' ? { trashed_at: '2026-11-05T00:00:00Z', status: 'draft' } : {}),
      ...(request.operation === 'move' ? { parent_id: request.parentId, position: request.position } : {}) }, replayed: false }, error: null }))
  })
  it('moves a page under a parent after its siblings without touching the URL', async () => {
    await mount()
    const panel = screen.getByText('Page attributes').closest('details')!
    panel.open = true
    fireEvent(panel, new Event('toggle'))
    const parentSelect = await screen.findByLabelText('Parent page')
    expect(screen.getByRole('option', { name: 'Company (/company)' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /About/ })).not.toBeInTheDocument()
    fireEvent.change(parentSelect, { target: { value: parent } })
    fireEvent.change(screen.getByLabelText('Order'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Move page' }))
    await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce())
    expect(mocks.write.mock.calls[0][0]).toMatchObject({ operation: 'move', pageId: id, expectedRevision: id, parentId: parent, position: 1 })
    expect(await screen.findByText('Page moved. Its URL is unchanged.')).toBeInTheDocument()
  })
  it('trashes after confirmation and then shows a read-only page with restore', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }))
    await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce())
    expect(mocks.write.mock.calls[0][0]).toMatchObject({ operation: 'trash', pageId: id, expectedRevision: id })
    expect(await screen.findByRole('alert', { name: 'Page in trash' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Move to trash' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore from trash' }))
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(2))
    expect(mocks.write.mock.calls[1][0]).toMatchObject({ operation: 'recover' })
  })
  it('does not trash without confirmation or with unsaved changes', async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }))
    fireEvent.change(screen.getByLabelText('Title', { exact: true }), { target: { value: 'Unsaved' } })
    expect(screen.getByRole('button', { name: 'Move to trash' })).toBeDisabled()
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('shows only a notice for a permanently deleted page', async () => {
    render(<PageManager accountId={id} documentId={id} initialPage={{ ...page, trashed_at: '2026-11-05T00:00:00Z', purged_at: '2026-11-05T01:00:00Z' }} />)
    expect(await screen.findByText(/permanently deleted/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument()
  })
})

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { useDraftRecovery } from '@/features/posts/drafts/use-draft-recovery'
import { loadWorkingCopy, saveWorkingCopy, discardWorkingCopy } from '@/features/posts/drafts/actions'
import { draftValues, type WorkingCopy } from '@/features/posts/drafts/schema'
import { readRecovery, recoveryKey } from '@/features/posts/drafts/storage'

vi.mock('@/features/posts/drafts/actions', () => ({ loadWorkingCopy: vi.fn(), saveWorkingCopy: vi.fn(), discardWorkingCopy: vi.fn() }))
const identity = { userId: 'author-a', documentId: 'document-a' }
const blank = { ...draftValues(), editorial_reviewed: false }
const copy = (content: string, revision = 'revision-1'): WorkingCopy => ({ document_id: identity.documentId, post_id: null, revision, values: { ...blank, content }, base_updated_at: null, updated_at: '2026-10-07T00:00:00Z' })
function mount(id = identity, postId: string | null = null, updatedAt: string | null = null) {
  return renderHook(() => {
    const form = useForm({ defaultValues: blank })
    const recovery = useDraftRecovery(form, id, postId, updatedAt)
    return { form, recovery }
  })
}
async function ready(hook: ReturnType<typeof mount>) { await waitFor(() => expect(hook.result.current.recovery.ready).toBe(true)) }
function type(hook: ReturnType<typeof mount>, value: string) { act(() => hook.result.current.form.setValue('content', value)) }
async function retry(hook: ReturnType<typeof mount>) { await act(async () => { hook.result.current.recovery.retry() }) }
function closeEvent() { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event }

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  Object.defineProperty(window, 'navigation', { value: new EventTarget(), configurable: true })
  vi.mocked(loadWorkingCopy).mockResolvedValue({})
  vi.mocked(saveWorkingCopy).mockImplementation(async input => ({ data: { ...copy(input.values.content, input.revision), values: input.values } }))
  vi.mocked(discardWorkingCopy).mockResolvedValue({})
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('draft recovery and safe autosave', () => {
  it('throttles repeated storage writes and flushes the latest text on unmount', async () => {
    const hook = mount(); await ready(hook)
    vi.useFakeTimers()
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    type(hook, 'First'); type(hook, 'Second'); type(hook, 'Third')
    expect(writes).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(writes).toHaveBeenCalledTimes(2)
    expect(readRecovery(identity.userId)[0].record.values.content).toBe('Third')
    type(hook, 'Final'); hook.unmount()
    expect(readRecovery(identity.userId)[0].record.values.content).toBe('Final')
  })
  it('preserves oversized Unicode writing locally without sending an impossible autosave', async () => {
    const hook = mount(); await ready(hook)
    type(hook, '界'.repeat(250_001)); await retry(hook)
    expect(saveWorkingCopy).not.toHaveBeenCalled()
    expect(hook.result.current.recovery.error).toContain('too large')
    expect(readRecovery(identity.userId)[0].record.values.content).toHaveLength(250_001)
    type(hook, 'Shorter'); await retry(hook)
    expect(hook.result.current.recovery.status).toBe('saved')
  })
  it('offers interrupted new-post writing when reopening its already-created post', async () => {
    const first = mount(); await ready(first); type(first, 'Lost create acknowledgement'); first.unmount()
    const edit = mount(identity, identity.documentId, '2026-10-07T00:10:00Z'); await ready(edit)
    expect(edit.result.current.recovery.candidates).toHaveLength(1)
  })
  it('persists initial edits immediately and offers restoration after interruption', async () => {
    const first = mount(); await ready(first)
    type(first, 'Interrupted writing')
    expect(readRecovery(identity.userId)[0].record.values.content).toBe('Interrupted writing')
    expect(closeEvent().defaultPrevented).toBe(true)
    first.unmount()
    const reopened = mount(); await ready(reopened)
    expect(reopened.result.current.form.getValues('content')).toBe('')
    const candidate = reopened.result.current.recovery.candidates[0]
    act(() => reopened.result.current.recovery.restore(candidate.id))
    expect(reopened.result.current.form.getValues('content')).toBe('Interrupted writing')
    expect(reopened.result.current.form.getValues('editorial_reviewed')).toBe(false)
  })
  it('debounces typing, then clears recovery and navigation warnings after server acknowledgement', async () => {
    const hook = mount(); await ready(hook)
    vi.useFakeTimers()
    type(hook, 'First'); type(hook, 'Final')
    await act(async () => { await vi.advanceTimersByTimeAsync(1199) })
    expect(saveWorkingCopy).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(saveWorkingCopy).toHaveBeenCalledTimes(1)
    expect(saveWorkingCopy).toHaveBeenCalledWith(expect.objectContaining({ values: expect.objectContaining({ content: 'Final' }) }))
    expect(hook.result.current.recovery.status).toBe('saved')
    expect(readRecovery(identity.userId)).toEqual([])
    expect(closeEvent().defaultPrevented).toBe(false)
  })
  it('does not overwrite newer input or clear its recovery when an older response arrives', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof saveWorkingCopy>>) => void
    vi.mocked(saveWorkingCopy).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const hook = mount(); await ready(hook)
    type(hook, 'Submitted')
    act(() => hook.result.current.recovery.retry())
    const request = vi.mocked(saveWorkingCopy).mock.calls[0][0]
    type(hook, 'Newer writing')
    await act(async () => { resolve({ data: copy('Submitted', request.revision) }) })
    expect(hook.result.current.form.getValues('content')).toBe('Newer writing')
    expect(readRecovery(identity.userId)[0].record.values.content).toBe('Newer writing')
    expect(closeEvent().defaultPrevented).toBe(true)
    await retry(hook)
    expect(vi.mocked(saveWorkingCopy).mock.calls[1][0].expectedRevision).toBe(request.revision)
    expect(closeEvent().defaultPrevented).toBe(false)
  })
  it.each(['Offline', 'Your session expired'])('retains writing after %s failure and supports retry', async message => {
    vi.mocked(saveWorkingCopy).mockResolvedValueOnce({ error: message })
    const hook = mount(); await ready(hook); type(hook, 'Keep me')
    await retry(hook)
    expect(hook.result.current.recovery.status).toBe('failed')
    expect(readRecovery(identity.userId)[0].record.values.content).toBe('Keep me')
    expect(closeEvent().defaultPrevented).toBe(true)
    await retry(hook)
    expect(hook.result.current.recovery.status).toBe('saved')
    // The same request token handles a lost acknowledgement idempotently.
    expect(vi.mocked(saveWorkingCopy).mock.calls[1][0].revision).toBe(vi.mocked(saveWorkingCopy).mock.calls[0][0].revision)
  })
  it('handles rejected network promises and storage failures without losing the form', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota') })
    vi.mocked(saveWorkingCopy).mockRejectedValueOnce(new Error('Network'))
    const hook = mount(); await ready(hook); type(hook, 'Still in editor')
    expect(hook.result.current.recovery.storageError).toMatch(/Local recovery is unavailable/)
    await retry(hook)
    expect(hook.result.current.recovery.status).toBe('failed')
    expect(hook.result.current.form.getValues('content')).toBe('Still in editor')
    expect(closeEvent().defaultPrevented).toBe(true)
  })
  it('offers the private server working copy without replacing original content or autosaving it', async () => {
    vi.mocked(loadWorkingCopy).mockResolvedValue({ data: copy('Server draft') })
    const hook = mount(); await ready(hook)
    expect(hook.result.current.form.getValues('content')).toBe('')
    expect(hook.result.current.recovery.candidates).toHaveLength(1)
    await retry(hook)
    expect(saveWorkingCopy).not.toHaveBeenCalled()
    act(() => hook.result.current.recovery.restore('server'))
    expect(hook.result.current.form.getValues('content')).toBe('Server draft')
    expect(hook.result.current.recovery.status).toBe('saved')
    expect(closeEvent().defaultPrevented).toBe(false)
  })
  it('scopes recovery by author, document and tab; one tab cannot clear another local copy', async () => {
    const a = mount(); await ready(a); type(a, 'Tab A')
    const b = mount(); await ready(b)
    act(() => b.result.current.recovery.restore(b.result.current.recovery.candidates[0].id))
    type(b, 'Tab B'); window.dispatchEvent(new Event('pagehide'))
    expect(readRecovery(identity.userId)).toHaveLength(2)
    await retry(a)
    expect(readRecovery(identity.userId)).toHaveLength(1)
    expect(readRecovery(identity.userId)[0].record.values.content).toBe('Tab B')
    const otherPost = mount({ ...identity, documentId: 'document-b' }); await ready(otherPost)
    const otherAuthor = mount({ ...identity, userId: 'author-b' }); await ready(otherAuthor)
    expect(otherPost.result.current.recovery.candidates).toEqual([])
    expect(otherAuthor.result.current.recovery.candidates).toEqual([])
  })
  it('does not clear a restored local entry if its original tab has since typed newer writing', async () => {
    const a = mount(); await ready(a); type(a, 'Original tab snapshot')
    const b = mount(); await ready(b)
    act(() => b.result.current.recovery.restore(b.result.current.recovery.candidates[0].id))
    type(a, 'Newer text in original tab'); window.dispatchEvent(new Event('pagehide'))
    await retry(b)
    expect(readRecovery(identity.userId)).toHaveLength(1)
    expect(readRecovery(identity.userId)[0].record.values.content).toBe('Newer text in original tab')
  })
  it('keeps conflicting tab input locally and does not announce it as saved', async () => {
    vi.mocked(saveWorkingCopy).mockResolvedValue({ error: 'Another tab changed this working copy', conflict: true })
    const hook = mount(); await ready(hook); type(hook, 'Conflict copy'); await retry(hook)
    expect(hook.result.current.recovery.status).toBe('failed')
    expect(closeEvent().defaultPrevented).toBe(true)
    expect(readRecovery(identity.userId)[0].record.values.content).toBe('Conflict copy')
  })
  it('waits for in-flight autosave before a manual save and preserves edits typed during that save', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof saveWorkingCopy>>) => void
    vi.mocked(saveWorkingCopy).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const hook = mount(); await ready(hook); type(hook, 'Autosave text')
    act(() => hook.result.current.recovery.retry())
    let began = false
    const manual = hook.result.current.recovery.beginSave().then(() => { began = true })
    expect(began).toBe(false)
    await act(async () => { resolve({ data: copy('Autosave text') }); await manual })
    const submitted = hook.result.current.form.getValues()
    type(hook, 'Later text')
    await act(async () => { await hook.result.current.recovery.finishSave(submitted, '2026-10-07T00:10:00Z') })
    expect(readRecovery(identity.userId)[0].record.values.content).toBe('Later text')
    expect(closeEvent().defaultPrevented).toBe(true)
    expect(discardWorkingCopy).toHaveBeenCalledWith(identity.documentId, null, 'revision-1', identity.userId)
  })
  it.each(['new-post', identity.documentId])('carries newer writing to post %s after slow creation', async createdId => {
    const hook = mount(); await ready(hook); type(hook, 'Created text')
    await hook.result.current.recovery.beginSave()
    const submitted = hook.result.current.form.getValues()
    type(hook, 'Typed during creation')
    await act(async () => { await hook.result.current.recovery.finishSave(submitted, '2026-10-07T00:10:00Z', createdId) })
    expect(readRecovery(identity.userId)[0].record).toMatchObject({ documentId: createdId, postId: createdId, values: { content: 'Typed during creation' } })
    type(hook, 'Typed while the edit route loads'); window.dispatchEvent(new Event('pagehide'))
    expect(readRecovery(identity.userId)[0].record).toMatchObject({ documentId: createdId, values: { content: 'Typed while the edit route loads' } })
  })
  it('warns before internal navigation and permits explicit discard only after confirmation', async () => {
    const hook = mount(); await ready(hook); type(hook, 'Unsaved')
    vi.mocked(window.confirm).mockReturnValue(false)
    const link = document.createElement('a'); link.href = '/dashboard/posts'; document.body.appendChild(link)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await act(async () => { expect(await hook.result.current.recovery.discard()).toBe(false) })
    expect(readRecovery(identity.userId)).toHaveLength(1)
    vi.mocked(window.confirm).mockReturnValue(true)
    await act(async () => { expect(await hook.result.current.recovery.discard()).toBe(true) })
    expect(readRecovery(identity.userId)).toEqual([])
    expect(closeEvent().defaultPrevented).toBe(false)
    link.remove()
  })
  it('requires explicit confirmation to restore a copy older than the loaded post, then rebases manual saves', async () => {
    vi.mocked(loadWorkingCopy).mockResolvedValue({ data: { ...copy('Older text'), post_id: identity.documentId, base_updated_at: '2026-10-06T00:00:00Z' } })
    const hook = mount(identity, identity.documentId, '2026-10-07T00:00:00Z'); await ready(hook)
    vi.mocked(window.confirm).mockReturnValue(false)
    act(() => hook.result.current.recovery.restore('server'))
    expect(hook.result.current.form.getValues('content')).toBe('')
    vi.mocked(window.confirm).mockReturnValue(true)
    act(() => hook.result.current.recovery.restore('server'))
    expect(hook.result.current.form.getValues('content')).toBe('Older text')
    expect(await hook.result.current.recovery.beginSave()).toBe('2026-10-07T00:00:00Z')
  })
  it('ignores corrupt recovery without deleting unrelated entries', () => {
    const key = recoveryKey({ ...identity, writerId: 'broken' })
    localStorage.setItem(key, '{bad json')
    expect(readRecovery(identity.userId)).toEqual([])
    expect(localStorage.getItem(key)).toBe('{bad json')
  })
})

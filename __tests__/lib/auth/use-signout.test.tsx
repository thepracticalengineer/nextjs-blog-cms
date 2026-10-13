import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/auth/signout-client', () => ({ signOut: vi.fn() }))
vi.mock('@/features/posts/drafts/navigation', () => ({ allowEditorNavigation: vi.fn(), commitEditorNavigation: vi.fn() }))
import { signOut } from '@/lib/auth/signout-client'
import { allowEditorNavigation, commitEditorNavigation } from '@/features/posts/drafts/navigation'
import { useSignOut } from '@/components/auth/use-signout'
const replace = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { location: { replace } })
  vi.mocked(allowEditorNavigation).mockReturnValue(true)
  vi.mocked(signOut).mockResolvedValue({ localCleared: true, remoteRevoked: true })
})
afterEach(() => vi.unstubAllGlobals())
describe('logout control flow', () => {
  it('preserves unsaved writing when the editor guard cancels', async () => {
    vi.mocked(allowEditorNavigation).mockReturnValue(false)
    const { result } = renderHook(useSignOut)
    await act(() => result.current.handleSignOut())
    expect(commitEditorNavigation).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })
  it.each(['local', 'global'] as const)('uses %s and discards cached private UI through full navigation', async scope => {
    const { result } = renderHook(useSignOut)
    await act(() => result.current.handleSignOut(scope))
    expect(signOut).toHaveBeenCalledWith(scope)
    expect(commitEditorNavigation).toHaveBeenCalledOnce()
    expect(replace).toHaveBeenCalledWith('/login')
  })
  it.each([['local', 'local_only'], ['global', 'global_unconfirmed']] as const)('reports unconfirmed %s revocation after local cleanup', async (scope, warning) => {
    vi.mocked(signOut).mockResolvedValue({ localCleared: true, remoteRevoked: false })
    const { result } = renderHook(useSignOut)
    await act(() => result.current.handleSignOut(scope))
    expect(replace).toHaveBeenCalledWith(`/login?logout=${warning}`)
  })
  it('stays in place and permits retry when credentials cannot be cleared', async () => {
    vi.mocked(signOut).mockResolvedValue({ localCleared: false, remoteRevoked: false })
    const { result } = renderHook(useSignOut)
    await act(() => result.current.handleSignOut())
    expect(replace).not.toHaveBeenCalled()
    expect(result.current.signOutError).toContain('could not be cleared')
    expect(result.current.signingOut).toBe(false)
  })
  it('handles unexpected rejection without getting stuck busy', async () => {
    vi.mocked(signOut).mockRejectedValue(new Error('unexpected'))
    const { result } = renderHook(useSignOut)
    await act(() => result.current.handleSignOut())
    expect(result.current.signOutError).toContain('could not finish')
    expect(result.current.signingOut).toBe(false)
  })
  it('keeps controls busy and blocks another scope after navigation starts', async () => {
    const { result } = renderHook(useSignOut)
    await act(() => result.current.handleSignOut('local'))
    expect(result.current.signingOut).toBe(true)
    await act(() => result.current.handleSignOut('global'))
    expect(signOut).toHaveBeenCalledOnce()
    expect(replace).toHaveBeenCalledOnce()
  })
  it('ignores duplicate activation while logout is running', async () => {
    let finish!: (value: { localCleared: boolean; remoteRevoked: boolean }) => void
    vi.mocked(signOut).mockReturnValue(new Promise(resolve => { finish = resolve }))
    const { result } = renderHook(useSignOut)
    let first!: Promise<void>
    act(() => { first = result.current.handleSignOut() })
    await act(() => result.current.handleSignOut('global'))
    expect(signOut).toHaveBeenCalledOnce()
    await act(async () => { finish({ localCleared: true, remoteRevoked: true }); await first })
  })
})

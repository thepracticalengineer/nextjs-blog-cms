import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const stopAutoRefresh = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { stopAutoRefresh } }) }))
import { signOut } from '@/lib/auth/signout-client'
const key = 'sb-disposable-auth-token'
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://disposable.supabase.co')
  for (const name of [key, `${key}.0`, `${key}.12`, `${key}-user`, `${key}-flow-abc-code-verifier`]) document.cookie = `${name}=synthetic; Path=/`
  document.cookie = 'theme=dark; Path=/'
  localStorage.setItem('cms-draft-recovery', 'preserved-writing')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
})
afterEach(() => {
  for (const cookie of document.cookie.split(';')) document.cookie = `${cookie.split('=')[0].trim()}=; Max-Age=0; Path=/`
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks()
})
describe('shared browser signout', () => {
  it.each(['local', 'global'] as const)('uses %s scope and clears all browser chunks', async scope => {
    expect(await signOut(scope)).toEqual({ localCleared: true, remoteRevoked: true })
    expect(fetch).toHaveBeenCalledWith(`/api/auth/signout?scope=${scope}`, expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }))
    expect(stopAutoRefresh).toHaveBeenCalled()
    expect(document.cookie).not.toContain(key)
    expect(document.cookie).toContain('theme=dark')
    expect(localStorage.getItem('cms-draft-recovery')).toBe('preserved-writing')
  })
  it.each(['returned', 'network', 'thrown', 'timeout'])('clears browser credentials after %s failure', async failure => {
    if (failure === 'returned') vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }))
    else vi.mocked(fetch).mockRejectedValue(failure === 'timeout' ? new DOMException('timeout', 'TimeoutError') : new Error('synthetic failure'))
    expect(await signOut()).toEqual({ localCleared: true, remoteRevoked: false })
    expect(document.cookie).not.toContain(key)
  })
  it('does not claim cleanup when browser refuses cookie deletion', async () => {
    const actual = document.cookie
    vi.spyOn(document, 'cookie', 'get').mockReturnValue(actual)
    vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {})
    expect(await signOut()).toEqual({ localCleared: false, remoteRevoked: true })
  })
})

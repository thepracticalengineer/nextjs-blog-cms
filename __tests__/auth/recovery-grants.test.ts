import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getClaims: vi.fn(), get: vi.fn(), getAll: vi.fn(), set: vi.fn(), remove: vi.fn(), insert: vi.fn(), result: vi.fn(), from: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: mocks.get, getAll: mocks.getAll, set: mocks.set, delete: mocks.remove }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser, getClaims: mocks.getClaims } }) }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from }) }))
import { clearRecoveryAuthCookies, clearRecoveryGrant, createRecoveryGrant, consumeRecoveryGrant, hasRecoveryGrant, RECOVERY_COOKIE } from '@/lib/auth/recovery'

let chain: Record<string, ReturnType<typeof vi.fn>>
beforeEach(() => {
  vi.resetAllMocks()
  mocks.get.mockReturnValue({ value: '11111111-1111-4111-8111-111111111111' })
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user' } }, error: null })
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: 'user', session_id: 'session' } }, error: null })
  mocks.result.mockResolvedValue({ data: { id: 'grant' }, error: null })
  mocks.insert.mockResolvedValue({ error: null })
  chain = {}
  for (const method of ['select', 'delete', 'eq', 'gt']) chain[method] = vi.fn(() => chain)
  chain.maybeSingle = mocks.result
  chain.insert = mocks.insert
  mocks.from.mockReturnValue(chain)
})

describe('server recovery grants', () => {
  it('clears the recovery capability cookie', async () => {
    await clearRecoveryGrant()
    expect(mocks.remove).toHaveBeenCalledWith(RECOVERY_COOKIE)
  })
  it('clears auth cookie chunks without deleting unrelated browser cookies', async () => {
    mocks.getAll.mockReturnValue([{ name: 'sb-project-auth-token.0' }, { name: 'sb-project-auth-token.1' }, { name: 'theme' }])
    await clearRecoveryAuthCookies()
    expect(mocks.remove.mock.calls).toEqual([['sb-project-auth-token.0'], ['sb-project-auth-token.1']])
  })
  it('creates a short-lived, session-bound capability in an HttpOnly cookie', async () => {
    await createRecoveryGrant({ auth: { getClaims: mocks.getClaims } } as never)
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user', session_id: 'session' }))
    expect(mocks.set).toHaveBeenCalledWith(RECOVERY_COOKIE, expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: 'lax', maxAge: 900 }))
  })
  it('rejects a session without a verified session ID when creating a grant', async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: 'user' } }, error: null })
    await expect(createRecoveryGrant({ auth: { getClaims: mocks.getClaims } } as never)).rejects.toThrow()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('never sets a capability cookie if storage fails', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'db' } })
    await expect(createRecoveryGrant({ auth: { getClaims: mocks.getClaims } } as never)).rejects.toThrow()
    expect(mocks.set).not.toHaveBeenCalled()
  })
  it.each([undefined, { value: 'forged' }])('rejects missing or malformed cookie %s', async cookie => {
    mocks.get.mockReturnValue(cookie)
    expect(await consumeRecoveryGrant()).toBeNull()
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('rejects an invalid auth session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } })
    expect(await consumeRecoveryGrant()).toBeNull()
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('matches grant, user, session and expiry when atomically consuming', async () => {
    expect(await consumeRecoveryGrant()).not.toBeNull()
    expect(chain.delete).toHaveBeenCalledOnce()
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user')
    expect(chain.eq).toHaveBeenCalledWith('session_id', 'session')
    expect(chain.gt).toHaveBeenCalledWith('expires_at', expect.any(String))
  })
  it('rejects expired, consumed or wrong-session grants when no row matches', async () => {
    mocks.result.mockResolvedValue({ data: null, error: null })
    expect(await consumeRecoveryGrant()).toBeNull()
    expect(await hasRecoveryGrant()).toBe(false)
  })
  it('consumes once even when the same cookie is submitted again', async () => {
    mocks.result.mockResolvedValueOnce({ data: { id: 'grant' }, error: null }).mockResolvedValue({ data: null, error: null })
    expect(await consumeRecoveryGrant()).not.toBeNull()
    expect(await consumeRecoveryGrant()).toBeNull()
  })
  it('fails closed if storage is unavailable', async () => {
    mocks.result.mockResolvedValue({ data: null, error: { message: 'db' } })
    expect(await consumeRecoveryGrant()).toBeNull()
    expect(await hasRecoveryGrant()).toBe(false)
  })
})

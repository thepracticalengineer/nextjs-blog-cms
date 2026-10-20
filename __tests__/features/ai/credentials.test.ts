// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({ authorizeSession: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/encryption', () => ({ decryptSecret: vi.fn((value: string) => `plain:${value}`) }))
import { authorizeSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { getProviderKey } from '@/features/ai/credentials'
const single = vi.fn()
const eq = vi.fn()
const chain = { select: vi.fn(), eq, maybeSingle: single }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(authorizeSession).mockResolvedValue({ profile: { id: 'owner', role: 'author' }, failure: null } as Awaited<ReturnType<typeof authorizeSession>>)
  chain.select.mockReturnValue(chain); eq.mockReturnValue(chain)
  vi.mocked(createClient).mockResolvedValue({ from: vi.fn(() => chain) } as unknown as Awaited<ReturnType<typeof createClient>>)
})
it('resolves only the authenticated owner, including for admins', async () => {
  single.mockResolvedValue({ data: { encrypted_key: 'cipher' }, error: null })
  expect(await getProviderKey('openai')).toBe('plain:cipher')
  expect(eq).toHaveBeenCalledWith('user_id', 'owner')
  expect(eq).toHaveBeenCalledWith('provider', 'openai')
})
it('never falls back to shared environment credentials', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'shared-key')
  single.mockResolvedValue({ data: null, error: null })
  await expect(getProviderKey('openai')).rejects.toThrow('Configure')
  vi.unstubAllEnvs()
})
it('fails closed before reading credentials when authentication fails', async () => {
  vi.mocked(authorizeSession).mockResolvedValue({ profile: null, failure: { code: 'MFA_REQUIRED', status: 403, error: 'MFA required' } })
  await expect(getProviderKey('openai')).rejects.toThrow('MFA required')
  expect(createClient).not.toHaveBeenCalled()
})
it('distinguishes database outages from missing keys without leaking details', async () => {
  single.mockResolvedValue({ data: null, error: { message: 'sensitive backend detail' } })
  await expect(getProviderKey('openai')).rejects.toThrow('could not be loaded')
})

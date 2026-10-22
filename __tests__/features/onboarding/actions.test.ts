import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ authorizeSession: mocks.authorize }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: mocks.rpc }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { saveOnboarding } from '@/features/onboarding/actions'
const input = { full_name: 'Jane', original_name: 'Jane', experience: '1-3', profession: 'software-engineer', referral: '', interests: [], step: 1, revision: 0, complete: false }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.authorize.mockResolvedValue({ profile: { id: 'owner' }, failure: null })
  mocks.rpc.mockResolvedValue({ data: { step: 1, revision: 1, completed_at: null }, error: null })
})
it('checks identity and assurance before writes', async () => {
  mocks.authorize.mockResolvedValue({ profile: null, failure: { error: 'Complete MFA' } })
  expect(await saveOnboarding(input)).toEqual({ error: 'Complete MFA' })
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('rejects injected ownership and permission fields', async () => {
  expect((await saveOnboarding({ ...input, user_id: 'victim', role: 'admin' })).error).toBeTruthy()
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('returns durable progress only after successful transaction', async () => {
  expect(await saveOnboarding(input)).toMatchObject({ progress: { revision: 1 } })
})
it('makes stale revisions recoverable and never claims completion on failed saves', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'private details' } })
  expect(await saveOnboarding(input)).toMatchObject({ conflict: true, error: expect.stringContaining('Reload') })
  mocks.rpc.mockRejectedValue(Error('offline'))
  expect(await saveOnboarding(input)).toEqual({ error: 'Unable to save. Your answers are still here; try again.' })
})

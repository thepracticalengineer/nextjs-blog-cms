import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), createClient: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { register } from '@/app/(auth)/register/actions'

function form(password?: string) {
  const result = new FormData()
  result.set('email', 'signup@example.com')
  result.set('full_name', 'New User')
  if (password !== undefined) result.set('password', password)
  return result
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.com')
  mocks.createClient.mockResolvedValue({ auth: { signUp: mocks.signUp } })
  mocks.signUp.mockResolvedValue({ data: { session: null }, error: null })
})

describe('signup server password validation', () => {
  it.each(['123456', '1234567', '', undefined])('rejects password %s before contacting Auth', async password => {
    expect((await register(form(password))).error).toBeTruthy()
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.signUp).not.toHaveBeenCalled()
  })
  it('enforces the eight-character minimum even without browser validation', async () => {
    expect(await register(form('1234567'))).toEqual({ error: 'Password must be at least 8 characters' })
  })
  it('accepts the boundary and preserves confirmation-required signup', async () => {
    expect(await register(form('12345678'))).toEqual({ needsConfirmation: true })
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({ password: '12345678' }))
  })
  it('preserves immediate-session signup', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { user: { id: 'user' } } }, error: null })
    expect(await register(form('NewPassword123!'))).toEqual({ success: true })
    expect(mocks.revalidate).toHaveBeenCalledWith('/', 'layout')
  })
  it('preserves Auth errors for a valid password', async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: { message: 'Unable to sign up' } })
    expect(await register(form('NewPassword123!'))).toEqual({ error: 'Unable to sign up' })
  })
})

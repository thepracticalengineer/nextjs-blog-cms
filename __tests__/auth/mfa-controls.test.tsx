import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { listFactors, challenge, verify, handleSignOut } = vi.hoisted(() => ({ listFactors: vi.fn(), challenge: vi.fn(), verify: vi.fn(), handleSignOut: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { mfa: { listFactors, challenge, verify } } }) }))
vi.mock('@/components/auth/use-signout', () => ({ useSignOut: () => ({ handleSignOut, signingOut: false, signOutError: null }) }))
vi.mock('@/lib/auth/navigation', () => ({ safeReturnPath: () => '#verified' }))
import MfaChallenge from '@/components/auth/MfaChallenge'

const factors = [{ id: 'first', friendly_name: 'Phone', status: 'verified' }, { id: 'second', friendly_name: 'Backup', status: 'verified' }]
beforeEach(() => {
  vi.resetAllMocks()
  listFactors.mockResolvedValue({ data: { totp: factors }, error: null })
  challenge.mockResolvedValue({ data: { id: 'challenge' }, error: null })
  verify.mockResolvedValue({ error: null })
})
async function enterCode() {
  const input = await screen.findByLabelText('Verification Code')
  await waitFor(() => expect(input).toBeEnabled())
  fireEvent.change(input, { target: { value: '123456' } })
  return input
}

it.each(['returned', 'thrown', 'missing'])('recovers in place from %s factor failure', async kind => {
  if (kind === 'thrown') listFactors.mockRejectedValueOnce(new Error('network'))
  else listFactors.mockResolvedValueOnce({ data: kind === 'missing' ? { totp: [] } : null, error: kind === 'returned' ? { status: 503 } : null })
  render(<MfaChallenge next="#verified" />)
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading authenticators' }))
  await enterCode()
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
  await waitFor(() => expect(verify).toHaveBeenCalledOnce())
})
it.each(['returned', 'thrown'])('retries a %s challenge failure without remounting', async kind => {
  if (kind === 'thrown') challenge.mockRejectedValueOnce(new Error('network'))
  else challenge.mockResolvedValueOnce({ data: null, error: { status: 503 } })
  render(<MfaChallenge next="#verified" />)
  await enterCode()
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
  await screen.findByRole('alert')
  expect(verify).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
  await waitFor(() => expect(verify).toHaveBeenCalledOnce())
  expect(challenge).toHaveBeenCalledTimes(2)
})
it.each([
  [{ code: 'mfa_verification_failed' }, /Invalid code/],
  [{ code: 'mfa_challenge_expired' }, /expired.*fresh code/i],
  [{ code: 'over_request_rate_limit', status: 429 }, /Too many attempts/],
  [{ status: 429 }, /Too many attempts/],
  [{ code: 'unexpected_failure', status: 503 }, /temporarily unavailable/],
  [{ code: 'mfa_factor_not_found' }, /no longer available/],
  [{ code: 'session_not_found', status: 401 }, /session.*sign out/i],
])('classifies verification error %j', async (error, message) => {
  verify.mockResolvedValue({ error })
  render(<MfaChallenge next="#verified" />)
  await enterCode()
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  if ('code' in error && error.code === 'mfa_challenge_expired') expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled()
  else expect(screen.getByRole('button', { name: 'Verify' })).toBeEnabled()
})
it('creates a fresh challenge after expiry and clears the expired code', async () => {
  challenge.mockResolvedValueOnce({ data: { id: 'expired' }, error: null }).mockResolvedValueOnce({ data: { id: 'fresh' }, error: null })
  verify.mockResolvedValueOnce({ error: { code: 'mfa_challenge_expired' } }).mockResolvedValueOnce({ error: null })
  render(<MfaChallenge next="#verified" />)
  const input = await enterCode()
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
  await screen.findByText(/expired.*fresh code/i)
  expect(input).toHaveValue('')
  fireEvent.change(input, { target: { value: '654321' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
  await waitFor(() => expect(verify).toHaveBeenLastCalledWith({ factorId: 'first', challengeId: 'fresh', code: '654321' }))
})
it('selects a verified factor, clears the previous code, and uses the selected factor', async () => {
  listFactors.mockResolvedValue({ data: { totp: [...factors, { id: 'pending', status: 'unverified', friendly_name: 'Pending' }] }, error: null })
  render(<MfaChallenge next="#verified" />)
  const input = await enterCode()
  fireEvent.change(screen.getByLabelText('Authenticator'), { target: { value: 'second' } })
  expect(input).toHaveValue('')
  expect(screen.queryByRole('option', { name: 'Pending' })).toBeNull()
  fireEvent.change(input, { target: { value: '654321' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
  await waitFor(() => expect(challenge).toHaveBeenCalledWith({ factorId: 'second' }))
  expect(verify).toHaveBeenCalledWith({ factorId: 'second', challengeId: 'challenge', code: '654321' })
})
it('guards rapid Enter throughout challenge and verification, unlocks on throw, and holds on success', async () => {
  let resolveChallenge!: (result: unknown) => void
  let rejectVerify!: (error: Error) => void
  challenge.mockImplementationOnce(() => new Promise(resolve => { resolveChallenge = resolve }))
  verify.mockImplementationOnce(() => new Promise((_, reject) => { rejectVerify = reject }))
  render(<MfaChallenge next="#verified" />)
  const input = await enterCode()
  for (let i = 0; i < 10; i++) fireEvent.submit(input.closest('form')!)
  expect(challenge).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Authenticator')).toBeDisabled()
  await act(async () => resolveChallenge({ data: { id: 'challenge' }, error: null }))
  for (let i = 0; i < 10; i++) fireEvent.submit(input.closest('form')!)
  expect(verify).toHaveBeenCalledOnce()
  await act(async () => rejectVerify(new Error('Network down')))
  expect(screen.getByRole('button', { name: 'Verify' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
  await waitFor(() => expect(verify).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('button', { name: /Verifying/ })).toBeDisabled()
  fireEvent.submit(input.closest('form')!)
  expect(verify).toHaveBeenCalledTimes(2)
})
it('offers sign-out and actionable lost-authenticator guidance even after a load failure', async () => {
  listFactors.mockRejectedValueOnce(new Error('offline'))
  render(<MfaChallenge next="#verified" />)
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(handleSignOut).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByText('Lost access to your authenticator?'))
  expect(screen.getByText(/administrator.*verify your identity/i)).toBeInTheDocument()
  expect(screen.getByText(/password reset.*does not remove/i)).toBeInTheDocument()
})

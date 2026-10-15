import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TwoFactorSetup } from '@/features/profile/components/TwoFactorSetup'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))

import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
const mockCreateClient = vi.mocked(createClient)
const mockToast = vi.mocked(toast)

function makeSupabaseMfa({
  factors = [] as { id: string; factor_type: string; status: string }[],
  enrollResult = { data: { id: 'factor-new', totp: { qr_code: 'data:image/png;base64,abc', secret: 'SECRET123' } }, error: null } as any,
  challengeResult = { data: { id: 'challenge-1' }, error: null } as any,
  verifyResult = { error: null } as any,
  unenrollResult = { error: null } as any,
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { factors } }, error: null }),
      mfa: {
        listFactors: vi.fn().mockResolvedValue({ data: { all: factors, totp: factors.filter(f => f.status === 'verified') }, error: null }),
        enroll: vi.fn().mockResolvedValue(enrollResult),
        challenge: vi.fn().mockResolvedValue(challengeResult),
        verify: vi.fn().mockResolvedValue(verifyResult),
        unenroll: vi.fn().mockResolvedValue(unenrollResult),
      },
    },
  }
}

beforeEach(() => { vi.clearAllMocks() })

describe('TwoFactorSetup', () => {
  it('shows enabled badge when verified TOTP factor exists', async () => {
    mockCreateClient.mockReturnValue(
      makeSupabaseMfa({ factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }] }) as any
    )
    render(<TwoFactorSetup />)
    await screen.findByText(/enabled/i)
    expect(screen.getByText(/enabled/i)).toBeInTheDocument()
  })

  it('shows disabled badge when no factors', async () => {
    mockCreateClient.mockReturnValue(makeSupabaseMfa() as any)
    render(<TwoFactorSetup />)
    await screen.findByText(/disabled/i)
    expect(screen.getByText(/disabled/i)).toBeInTheDocument()
  })

  it('shows Enable 2FA button when disabled', async () => {
    mockCreateClient.mockReturnValue(makeSupabaseMfa() as any)
    render(<TwoFactorSetup />)
    await screen.findByRole('button', { name: /enable 2fa/i })
    expect(screen.getByRole('button', { name: /enable 2fa/i })).toBeInTheDocument()
  })

  it('shows Disable 2FA button when enabled', async () => {
    mockCreateClient.mockReturnValue(
      makeSupabaseMfa({ factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }] }) as any
    )
    render(<TwoFactorSetup />)
    await screen.findByRole('button', { name: /disable 2fa/i })
    expect(screen.getByRole('button', { name: /disable 2fa/i })).toBeInTheDocument()
  })

  it('opens enroll dialog when Enable 2FA is clicked', async () => {
    const supabaseMock = makeSupabaseMfa()
    mockCreateClient.mockReturnValue(supabaseMock as any)
    render(<TwoFactorSetup />)
    const enableBtn = await screen.findByRole('button', { name: /enable 2fa/i })
    fireEvent.click(enableBtn)
    await waitFor(() => expect(supabaseMock.auth.mfa.enroll).toHaveBeenCalledOnce())
    expect(await screen.findByLabelText(/verification code/i)).toBeInTheDocument()
  })

  it('shows error toast when enroll fails', async () => {
    const supabaseMock = makeSupabaseMfa({
      enrollResult: { data: null, error: { message: 'Enroll failed' } },
    })
    mockCreateClient.mockReturnValue(supabaseMock as any)
    render(<TwoFactorSetup />)
    const enableBtn = await screen.findByRole('button', { name: /enable 2fa/i })
    fireEvent.click(enableBtn)
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/temporarily unavailable/)))
  })

  it('calls unenroll when enroll dialog is dismissed before verifying', async () => {
    const supabaseMock = makeSupabaseMfa()
    mockCreateClient.mockReturnValue(supabaseMock as any)
    render(<TwoFactorSetup />)
    const enableBtn = await screen.findByRole('button', { name: /enable 2fa/i })
    fireEvent.click(enableBtn)
    await waitFor(() => expect(supabaseMock.auth.mfa.enroll).toHaveBeenCalledOnce())
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(supabaseMock.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'factor-new' }))
  })

  it('verifies TOTP code and marks 2FA as enabled', async () => {
    const supabaseMock = makeSupabaseMfa()
    mockCreateClient.mockReturnValue(supabaseMock as any)
    render(<TwoFactorSetup />)
    const enableBtn = await screen.findByRole('button', { name: /enable 2fa/i })
    fireEvent.click(enableBtn)
    const codeInput = await screen.findByLabelText(/verification code/i)
    fireEvent.change(codeInput, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))
    await waitFor(() => expect(supabaseMock.auth.mfa.verify).toHaveBeenCalledOnce())
    expect(await screen.findByText(/enabled/i)).toBeInTheDocument()
  })

  it('shows error toast when challenge fails', async () => {
    const supabaseMock = makeSupabaseMfa({
      challengeResult: { data: null, error: { message: 'Challenge failed' } },
    })
    mockCreateClient.mockReturnValue(supabaseMock as any)
    render(<TwoFactorSetup />)
    fireEvent.click(await screen.findByRole('button', { name: /enable 2fa/i }))
    const codeInput = await screen.findByLabelText(/verification code/i)
    fireEvent.change(codeInput, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/temporarily unavailable/)))
  })

  it('shows error toast when verify code is wrong', async () => {
    const supabaseMock = makeSupabaseMfa({ verifyResult: { error: { code: 'mfa_verification_failed', message: 'Invalid TOTP code' } } })
    mockCreateClient.mockReturnValue(supabaseMock as any)
    render(<TwoFactorSetup />)
    const enableBtn = await screen.findByRole('button', { name: /enable 2fa/i })
    fireEvent.click(enableBtn)
    const codeInput = await screen.findByLabelText(/verification code/i)
    fireEvent.change(codeInput, { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))
    await waitFor(() => expect(supabaseMock.auth.mfa.verify).toHaveBeenCalledOnce())
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument()
    expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/Invalid code/))
  })

  it('calls unenroll and clears factor on disable confirm', async () => {
    const supabaseMock = makeSupabaseMfa({ factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }] })
    mockCreateClient.mockReturnValue(supabaseMock as any)
    render(<TwoFactorSetup />)
    fireEvent.click(await screen.findByRole('button', { name: /disable 2fa/i }))
    const confirmBtn = await screen.findByRole('button', { name: /^disable 2fa$/i })
    fireEvent.click(confirmBtn)
    await waitFor(() => expect(supabaseMock.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'factor-1' }))
    expect(await screen.findByText(/disabled/i)).toBeInTheDocument()
  })

  it('shows error toast when disable fails', async () => {
    const supabaseMock = makeSupabaseMfa({
      factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }],
      unenrollResult: { error: { message: 'Cannot unenroll' } },
    })
    mockCreateClient.mockReturnValue(supabaseMock as any)
    render(<TwoFactorSetup />)
    fireEvent.click(await screen.findByRole('button', { name: /disable 2fa/i }))
    const confirmBtn = await screen.findByRole('button', { name: /^disable 2fa$/i })
    fireEvent.click(confirmBtn)
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/temporarily unavailable/)))
    expect(screen.getByRole('button', { name: /disable 2fa/i })).toBeInTheDocument()
  })

  it('cleans up unverified factors before enrolling', async () => {
    const supabaseMock = makeSupabaseMfa({
      factors: [{ id: 'stale-factor', factor_type: 'totp', status: 'unverified' }],
    })
    mockCreateClient.mockReturnValue(supabaseMock as any)
    render(<TwoFactorSetup />)
    fireEvent.click(await screen.findByRole('button', { name: /enable 2fa/i }))
    await waitFor(() => expect(supabaseMock.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'stale-factor' }))
    await waitFor(() => expect(supabaseMock.auth.mfa.enroll).toHaveBeenCalledOnce())
  })
})

it.each(['returned', 'thrown'])('does not report disabled after a %s factor lookup error and supports retry', async kind => {
  const client = makeSupabaseMfa({ factors: [{ id: 'first', factor_type: 'totp', status: 'verified' }] })
  if (kind === 'returned') client.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'offline' } } as any)
  else client.auth.getUser.mockRejectedValueOnce(new Error('offline'))
  mockCreateClient.mockReturnValue(client as any)
  render(<TwoFactorSetup />)
  await screen.findByRole('alert')
  expect(screen.queryByText('Disabled')).toBeNull()
  expect(screen.queryByRole('button', { name: /enable 2fa/i })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /retry/i }))
  expect(await screen.findByText('Enabled')).toBeInTheDocument()
})
it('preserves enabled status when another verified authenticator remains after removal', async () => {
  const client = makeSupabaseMfa({ factors: [{ id: 'first', factor_type: 'totp', status: 'verified' }, { id: 'second', factor_type: 'totp', status: 'verified' }] })
  mockCreateClient.mockReturnValue(client as any)
  render(<TwoFactorSetup />)
  const select = await screen.findByLabelText('Authenticator to remove')
  fireEvent.change(select, { target: { value: 'second' } })
  fireEvent.click(screen.getByRole('button', { name: /^remove authenticator$/i }))
  expect(await screen.findByRole('heading', { name: 'Remove authenticator?' })).toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button', { name: /^remove authenticator$/i }))
  await waitFor(() => expect(client.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'second' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.getByText('Enabled')).toBeInTheDocument()
})
it('classifies enrollment rate limits and prevents duplicate requests while a challenge is pending', async () => {
  const client = makeSupabaseMfa({ verifyResult: { error: { code: 'over_request_rate_limit', status: 429 } } })
  let resolveChallenge!: (result: unknown) => void
  client.auth.mfa.challenge.mockImplementationOnce(() => new Promise(resolve => { resolveChallenge = resolve }))
  mockCreateClient.mockReturnValue(client as any)
  render(<TwoFactorSetup />)
  fireEvent.click(await screen.findByRole('button', { name: /enable 2fa/i }))
  fireEvent.change(await screen.findByLabelText(/verification code/i), { target: { value: '123456' } })
  const button = screen.getByRole('button', { name: /verify/i })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(client.auth.mfa.challenge).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
  resolveChallenge({ data: { id: 'fresh' }, error: null })
  await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/Too many attempts/)))
  expect(button).toBeEnabled()
})

it('lets the user cancel and restart when a pending enrollment was removed elsewhere', async () => {
  const client = makeSupabaseMfa({ verifyResult: { error: { code: 'mfa_factor_not_found' } }, unenrollResult: { error: { code: 'mfa_factor_not_found' } } })
  mockCreateClient.mockReturnValue(client as any)
  render(<TwoFactorSetup />)
  fireEvent.click(await screen.findByRole('button', { name: /enable 2fa/i }))
  fireEvent.change(await screen.findByLabelText(/verification code/i), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: /verify/i }))
  await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/no longer available/)))
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: /enable 2fa/i }))
  await waitFor(() => expect(client.auth.mfa.enroll).toHaveBeenCalledTimes(2))
})

it('settles all stale removals before releasing enrollment after a cleanup failure', async () => {
  const client = makeSupabaseMfa({ factors: ['stale-1', 'stale-2'].map(id => ({ id, factor_type: 'totp', status: 'unverified' })) })
  let complete!: (result: { error: null }) => void
  client.auth.mfa.unenroll.mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  mockCreateClient.mockReturnValue(client as any)
  render(<TwoFactorSetup />)
  fireEvent.click(await screen.findByRole('button', { name: /enable 2fa/i }))
  await waitFor(() => expect(client.auth.mfa.unenroll).toHaveBeenCalledTimes(2))
  expect(client.auth.mfa.enroll).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: /enable 2fa/i })).toBeDisabled()
  await act(async () => complete({ error: null }))
  await waitFor(() => expect(screen.getByRole('button', { name: /enable 2fa/i })).toBeEnabled())
  expect(client.auth.mfa.enroll).not.toHaveBeenCalled()
  expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/temporarily unavailable/))
})

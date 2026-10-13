import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChangePasswordForm } from '@/features/profile/components/ChangePasswordForm'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/profile/actions', () => ({ updatePassword: vi.fn(), requestPasswordReauthentication: vi.fn() }))

import { updatePassword, requestPasswordReauthentication } from '@/features/profile/actions'
const mockUpdatePassword = vi.mocked(updatePassword)

beforeEach(() => { vi.clearAllMocks() })

describe('ChangePasswordForm', () => {
  it('renders current, new, and confirm password fields', () => {
    render(<ChangePasswordForm />)
    expect(screen.getByLabelText(/^current password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^confirm new password/i)).toBeInTheDocument()
  })

  it('shows error when new password and confirm do not match', async () => {
    render(<ChangePasswordForm />)
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'current123' } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'newpass123' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'different' } })
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument())
    expect(mockUpdatePassword).not.toHaveBeenCalled()
  })

  it('calls updatePassword with correct args on valid submit', async () => {
    mockUpdatePassword.mockResolvedValue({ success: true })
    render(<ChangePasswordForm />)
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'current123' } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'newpass123' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'newpass123' } })
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => expect(mockUpdatePassword).toHaveBeenCalledWith('current123', 'newpass123', undefined))
  })
})


it('offers verified recovery instead of asking provider accounts for a current password', () => {
  render(<ChangePasswordForm useEmailRecovery />)
  expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /set or reset password by email/i })).toHaveAttribute('href', '/forgot-password')
})

function submitPasswords() {
  fireEvent.change(screen.getByLabelText(/^current password/i), { target: { value: 'legacy' } })
  fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'newpass123' } })
  fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'newpass123' } })
  fireEvent.click(screen.getByRole('button', { name: /update password/i }))
}

it('retains passwords, validates the email code, retries with the nonce, and clears the challenge after success', async () => {
  mockUpdatePassword.mockResolvedValueOnce({ reauthenticationRequired: true, codeSent: true }).mockResolvedValueOnce({ success: true })
  render(<ChangePasswordForm />)
  submitPasswords()
  const code = await screen.findByLabelText('Email verification code')
  expect(screen.getByRole('status')).toHaveTextContent('sent')
  expect(screen.getByLabelText(/^current password/i)).toHaveValue('legacy')
  fireEvent.change(code, { target: { value: '12345' } })
  fireEvent.click(screen.getByRole('button', { name: /update password/i }))
  expect(await screen.findByText('Enter the six-digit code from your email.')).toBeInTheDocument()
  expect(mockUpdatePassword).toHaveBeenCalledTimes(1)
  fireEvent.change(code, { target: { value: '012345' } })
  fireEvent.click(screen.getByRole('button', { name: /update password/i }))
  await waitFor(() => expect(mockUpdatePassword).toHaveBeenLastCalledWith('legacy', 'newpass123', '012345'))
  await waitFor(() => expect(screen.queryByLabelText('Email verification code')).not.toBeInTheDocument())
  expect(screen.getByLabelText(/^new password/i)).toHaveValue('')
})

it('offers resend after a delivery failure, preserves the challenge on invalid codes, and disables actions while resending', async () => {
  mockUpdatePassword.mockResolvedValueOnce({ reauthenticationRequired: true, error: 'Unable to send a verification code. Please try again.' })
    .mockResolvedValueOnce({ reauthenticationRequired: true, error: 'That verification code is invalid or expired.' })
  let resolve!: (value: any) => void
  vi.mocked(requestPasswordReauthentication).mockImplementation(() => new Promise(done => { resolve = done }))
  render(<ChangePasswordForm />)
  submitPasswords()
  const code = await screen.findByLabelText('Email verification code')
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to send')
  fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))
  expect(await screen.findByRole('button', { name: 'Resend code' })).toBeDisabled()
  expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled()
  resolve({ reauthenticationRequired: true, codeSent: true })
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('sent'))
  fireEvent.change(code, { target: { value: '012345' } })
  fireEvent.click(screen.getByRole('button', { name: /update password/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent('invalid or expired')
  expect(code).toBeInTheDocument()
})

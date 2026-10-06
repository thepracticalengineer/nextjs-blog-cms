import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ request: vi.fn(), update: vi.fn() }))
vi.mock('@/app/(auth)/forgot-password/actions', () => ({ requestPasswordReset: mocks.request }))
vi.mock('@/app/(auth)/reset-password/actions', () => ({ resetPassword: mocks.update }))
import { ForgotPasswordForm, RECOVERY_CONFIRMATION } from '@/components/auth/ForgotPasswordForm'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.request.mockResolvedValue({ success: true })
  mocks.update.mockResolvedValue({ success: true })
})
afterEach(cleanup)
function fillReset(password: string, confirmPassword = password) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirmPassword } })
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }))
}

describe('recovery forms', () => {
  it('labels email and rejects invalid input', async () => {
    render(<ForgotPasswordForm />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address')
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('shows a neutral accessible confirmation', async () => {
    render(<ForgotPasswordForm />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toHaveTextContent(RECOVERY_CONFIRMATION)
  })
  it('disables duplicate requests while pending and recovers from errors', async () => {
    let resolve!: (result: { error: string }) => void
    mocks.request.mockReturnValue(new Promise(r => { resolve = r }))
    render(<ForgotPasswordForm />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    const button = await screen.findByRole('button', { name: 'Sending reset link…' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(mocks.request).toHaveBeenCalledOnce()
    resolve({ error: 'Too many requests' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests')
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeEnabled()
  })
  it('handles a rejected request and allows retry', async () => {
    mocks.request.mockRejectedValue(new Error('network'))
    render(<ForgotPasswordForm />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Please try again later')
  })
  it('offers a retry path without a form when recovery is invalid', () => {
    render(<ResetPasswordForm validRecovery={false} />)
    expect(screen.getByRole('alert')).toHaveTextContent('expired')
    expect(screen.getByRole('link', { name: 'Request a new reset link' })).toHaveAttribute('href', '/forgot-password')
    expect(screen.queryByRole('button')).toBeNull()
  })
  it.each([
    ['short', 'short', 'Password must be at least 8 characters'],
    ['LongPassword123!', 'Different123!', 'Passwords do not match'],
  ])('validates %s before update', async (password, confirm, message) => {
    render(<ResetPasswordForm validRecovery />)
    fillReset(password, confirm)
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('shows update success and a sign-in link', async () => {
    render(<ResetPasswordForm validRecovery />)
    fillReset('NewPassword123!')
    expect(await screen.findByRole('status')).toHaveTextContent('Sign in with your new password')
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
  })
  it('disables password submissions while pending', async () => {
    mocks.update.mockReturnValue(new Promise(() => {}))
    render(<ResetPasswordForm validRecovery />)
    fillReset('NewPassword123!')
    expect(await screen.findByRole('button', { name: 'Updating password…' })).toBeDisabled()
    expect(mocks.update).toHaveBeenCalledOnce()
  })
  it('requests an authenticator code and submits it with the retained passwords', async () => {
    mocks.update.mockResolvedValueOnce({ error: 'Enter your code', mfaRequired: true, factors: [{ id: 'factor-1', name: 'Phone' }] })
    render(<ResetPasswordForm validRecovery />)
    fillReset('NewPassword123!')
    fireEvent.change(await screen.findByLabelText('Authenticator code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Your password has been updated')
    const submitted = mocks.update.mock.calls[1][0] as FormData
    expect(submitted.get('code')).toBe('123456')
    expect(submitted.get('password')).toBe('NewPassword123!')
  })
  it('shows administrator guidance without a retry-email loop for MFA', async () => {
    mocks.update.mockResolvedValue({ error: 'Contact an administrator for two-factor verification.', invalidRecovery: true, mfaBlocked: true })
    render(<ResetPasswordForm validRecovery />)
    fillReset('NewPassword123!')
    expect(await screen.findByRole('alert')).toHaveTextContent('Contact an administrator')
    expect(screen.queryByRole('link', { name: 'Request a new reset link' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('offers a fresh link on update failure', async () => {
    mocks.update.mockResolvedValue({ error: 'Expired recovery session', invalidRecovery: true })
    render(<ResetPasswordForm validRecovery />)
    fillReset('NewPassword123!')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Expired recovery session'))
    expect(screen.getByRole('link', { name: 'Request a new reset link' })).toBeVisible()
  })
})

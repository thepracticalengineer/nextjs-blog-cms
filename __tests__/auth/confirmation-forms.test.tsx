import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/(auth)/confirm-email/actions', () => ({ resendConfirmation: vi.fn() }))
vi.mock('@/app/(auth)/login/actions', () => ({ login: vi.fn() }))
vi.mock('@/app/auth/oauth/actions', () => ({ startOAuth: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import { resendConfirmation } from '@/app/(auth)/confirm-email/actions'
import ConfirmationResendForm from '@/components/auth/ConfirmationResendForm'
import LoginPage from '@/app/(auth)/login/page'
import { CONFIRMATION_SENT } from '@/lib/auth/confirmation'

beforeEach(() => vi.resetAllMocks())
afterEach(() => vi.useRealTimers())
describe('confirmation recovery UI', () => {
  it('renders callback failures from the actual login page with a resend path', async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: 'invalid_confirmation' }) }))
    expect(screen.getByRole('alert')).toHaveTextContent('invalid, expired, or already used')
    expect(screen.getByRole('link', { name: 'Request a new confirmation link' })).toHaveAttribute('href', '/confirm-email')
  })
  it('does not echo arbitrary callback descriptions', async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: 'private-token-value' }) }))
    expect(screen.queryByText('private-token-value')).not.toBeInTheDocument()
  })
  it('validates email before dispatch', async () => {
    const { container } = render(<ConfirmationResendForm />)
    fireEvent.submit(container.querySelector('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address')
    expect(resendConfirmation).not.toHaveBeenCalled()
  })
  it('shows neutral status, locks competing submissions and allows retry after 60 seconds', async () => {
    vi.useFakeTimers()
    vi.mocked(resendConfirmation).mockResolvedValue({ success: true, retryAfter: 60 })
    const { container } = render(<ConfirmationResendForm />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'person@example.com' } })
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!)
      fireEvent.submit(container.querySelector('form')!)
    })
    expect(resendConfirmation).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent(CONFIRMATION_SENT)
    expect(screen.getByRole('button', { name: /Wait 60 seconds/ })).toBeDisabled()
    fireEvent.submit(container.querySelector('form')!)
    expect(resendConfirmation).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByRole('button', { name: 'Send confirmation link' })).toBeEnabled()
    await act(async () => { fireEvent.submit(container.querySelector('form')!) })
    expect(resendConfirmation).toHaveBeenCalledTimes(2)
  })
  it('shows a safe retry message on transport errors without leaking details', async () => {
    vi.mocked(resendConfirmation).mockRejectedValue(new Error('private detail'))
    const { container } = render(<ConfirmationResendForm />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'person@example.com' } })
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Check your connection'))
    expect(screen.getByRole('alert')).not.toHaveTextContent('private detail')
    expect(screen.getByRole('button', { name: 'Send confirmation link' })).toBeEnabled()
  })
})

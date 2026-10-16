import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAuthAbuse } from '@/components/auth/use-auth-abuse'
import { AuthAbuseControls } from '@/components/auth/AuthAbuseControls'
vi.mock('next/script', () => ({ default: () => null }))
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

function Harness() {
  const abuse = useAuthAbuse()
  return <>
    <AuthAbuseControls action="login" abuse={abuse} />
    <button onClick={() => abuse.receive({ retryAfter: 5 })}>Cooldown</button>
    <button onClick={() => abuse.receive({ captchaRequired: true })}>Challenge</button>
    <button disabled={abuse.blocked} onClick={() => { const data = new FormData(); abuse.prepare(data); submit(data); abuse.receive({}) }}>Submit</button>
  </>
}
const submit = vi.fn()
it('blocks retries for the server cooldown, then allows a legitimate retry', () => {
  vi.useFakeTimers(); submit.mockClear()
  render(<Harness />)
  fireEvent.click(screen.getByText('Cooldown'))
  expect(screen.getByText('Submit')).toBeDisabled()
  expect(screen.getByRole('timer')).toHaveTextContent('5 seconds')
  act(() => vi.advanceTimersByTime(5000))
  expect(screen.getByText('Submit')).toBeEnabled()
  fireEvent.click(screen.getByText('Submit'))
  expect(submit).toHaveBeenCalledOnce()
})
it('requires a fresh bot token, sends it, and invalidates it after each attempt', () => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'public-test-key')
  let callback!: (token: string) => void
  const remove = vi.fn()
  vi.stubGlobal('turnstile', { render: vi.fn((_element, options) => { callback = options.callback; return 'widget' }), remove })
  render(<Harness />)
  fireEvent.click(screen.getByText('Challenge'))
  expect(screen.getByText('Submit')).toBeDisabled()
  act(() => callback('fresh-token'))
  fireEvent.click(screen.getByText('Submit'))
  expect(submit.mock.lastCall?.[0].get('captchaToken')).toBe('fresh-token')
  expect(screen.getByText('Submit')).toBeDisabled()
  expect(remove).toHaveBeenCalledWith('widget')
})

it('expires challenges, ignores removed-widget callbacks and recovers from widget errors', () => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'public-test-key')
  const options: Parameters<NonNullable<Window['turnstile']>['render']>[1][] = []
  vi.stubGlobal('turnstile', { render: vi.fn((_element, config) => { options.push(config); return `widget-${options.length}` }), remove: vi.fn() })
  render(<Harness />)
  fireEvent.click(screen.getByText('Challenge'))
  act(() => options[0].callback('initial-token'))
  expect(screen.getByText('Submit')).toBeEnabled()
  act(() => options[0]['expired-callback']())
  expect(screen.getByText('Submit')).toBeDisabled()
  act(() => options[0].callback('stale-token'))
  expect(screen.getByText('Submit')).toBeDisabled()
  act(() => options[1]['error-callback']())
  expect(screen.getByRole('alert')).toHaveTextContent('could not load')
  fireEvent.click(screen.getByRole('button', { name: 'Retry security check' }))
  act(() => options[2].callback('new-token'))
  expect(screen.getByText('Submit')).toBeEnabled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

vi.mock('@/app/(auth)/login/actions', () => ({ login: vi.fn() }))
vi.mock('@/app/auth/oauth/actions', () => ({ startOAuth: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import LoginForm from '@/components/auth/LoginForm'
import { login } from '@/app/(auth)/login/actions'
import { waitFor } from '@testing-library/react'

it('replaces the login bot token after a lost server response so retry can succeed', async () => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'public-test-key')
  const options: Parameters<NonNullable<Window['turnstile']>['render']>[1][] = []
  vi.stubGlobal('turnstile', { render: vi.fn((_element, config) => { options.push(config); return `widget-${options.length}` }), remove: vi.fn() })
  vi.mocked(login).mockResolvedValueOnce({ error: 'Complete the security check', captchaRequired: true }).mockRejectedValueOnce(new Error('PRIVATE transport failure')).mockResolvedValueOnce({ error: 'Provider retry completed' })
  render(<LoginForm />)
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'test@example.com' } })
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'LegacyPassword' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await waitFor(() => expect(options).toHaveLength(1))
  act(() => options[0].callback('first-token'))
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Check your connection'))
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
  expect(options).toHaveLength(2)
  act(() => options[1].callback('replacement-token'))
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Provider retry completed'))
  expect(vi.mocked(login).mock.lastCall?.[0].get('captchaToken')).toBe('replacement-token')
})

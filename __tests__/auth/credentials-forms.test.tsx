import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/app/auth/oauth/actions', () => ({ startOAuth: vi.fn() }))
vi.mock('@/app/(auth)/login/actions', () => ({ login: vi.fn() }))
vi.mock('@/app/(auth)/register/actions', () => ({ register: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import { login } from '@/app/(auth)/login/actions'
import { register as registerAction } from '@/app/(auth)/register/actions'
import LoginForm from '@/components/auth/LoginForm'
import RegisterForm from '@/components/auth/RegisterForm'

beforeEach(() => vi.resetAllMocks())
for (const [name, Form, action] of [['login', LoginForm, login], ['signup', RegisterForm, registerAction]] as const) {
  function fill(container: HTMLElement, password = 'Password123!') {
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'test@example.com' } })
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: password } })
    if (name === 'signup') {
      fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test User' } })
      fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: password } })
    }
    return container.querySelector('form')!
  }
  it.each(['returned', 'thrown'])(`${name} restores controls, preserves input and allows retry after %s failure`, async kind => {
    if (kind === 'thrown') vi.mocked(action).mockRejectedValueOnce(new Error('PRIVATE'))
    else vi.mocked(action).mockResolvedValueOnce({ error: 'Please retry' })
    vi.mocked(action).mockResolvedValueOnce({ error: 'Second attempt' })
    const { container } = render(<Form />)
    const form = fill(container)
    fireEvent.submit(form)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(kind === 'thrown' ? 'Check your connection' : 'Please retry'))
    expect(screen.getByRole('alert')).not.toHaveTextContent('PRIVATE')
    expect(screen.getByLabelText('Email address')).toBeEnabled()
    expect(screen.getByLabelText('Email address')).toHaveValue('test@example.com')
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('Password123!')
    if (name === 'signup') {
      expect(screen.getByLabelText('Full name')).toHaveValue('Test User')
      expect(screen.getByLabelText('Confirm password')).toHaveValue('Password123!')
    }
    fireEvent.submit(form)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Second attempt'))
    expect(action).toHaveBeenCalledTimes(2)
  })
  it(`${name} prevents duplicate in-flight submissions`, async () => {
    let finish!: (value: { error: string }) => void
    vi.mocked(action).mockReturnValue(new Promise(resolve => { finish = resolve }))
    const { container } = render(<Form />)
    const form = fill(container)
    fireEvent.submit(form); fireEvent.submit(form)
    await waitFor(() => expect(screen.getByLabelText('Email address')).toBeDisabled())
    expect(action).toHaveBeenCalledOnce()
    fireEvent.submit(form)
    finish({ error: 'Try again' })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Try again'))
    expect(action).toHaveBeenCalledOnce()
  })
  if (name === 'login') it('allows a nonempty short legacy password', async () => {
    vi.mocked(action).mockResolvedValue({ error: 'Provider response' })
    const { container } = render(<Form />)
    fireEvent.submit(fill(container, 'x'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Provider response'))
    expect(vi.mocked(action).mock.calls[0][0].get('password')).toBe('x')
  })
}

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubscribeForm } from '@/components/newsletter/SubscribeForm'
import { trackNewsletterEvent } from '@/lib/analytics/client'

vi.mock('@/lib/analytics/client', () => ({ trackNewsletterEvent: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  history.replaceState(null, '', '/blog/article')
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function submit() {
  const user = userEvent.setup()
  render(<SubscribeForm />)
  await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'reader@example.com')
  await user.click(screen.getByRole('button', { name: 'Subscribe' }))
}

describe('newsletter event outcomes', () => {
  it('counts a new persisted subscription once, never sending the email', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, message: 'Subscribed' }), { status: 201 }))
    await submit()
    await screen.findByText("You're subscribed!")
    expect(trackNewsletterEvent).toHaveBeenNthCalledWith(1, 'newsletter_submit')
    expect(trackNewsletterEvent).toHaveBeenNthCalledWith(2, 'newsletter_subscribe')
    expect(trackNewsletterEvent).toHaveBeenCalledTimes(2)
  })
  it.each(["You're already subscribed", "You've been re-subscribed"])(
    'does not inflate new subscribers for %s', async message => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, message }), { status: 200 }))
      await submit()
      await screen.findByText("You're subscribed!")
      expect(trackNewsletterEvent).toHaveBeenCalledExactlyOnceWith('newsletter_submit')
    },
  )
  it.each([400, 429, 500])('does not count unsuccessful HTTP %s responses even with a success body', async status => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, message: 'Error' }), { status }))
    await submit()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled())
    expect(trackNewsletterEvent).toHaveBeenCalledExactlyOnceWith('newsletter_submit')
  })
  it('guards duplicate pending submits and ignores a response after navigation', async () => {
    let resolve!: (response: Response) => void
    fetchMock.mockReturnValue(new Promise<Response>(done => { resolve = done }))
    await submit()
    const form = screen.getByRole('button', { name: 'Subscribing...' }).closest('form')!
    fireEvent.submit(form)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    history.pushState(null, '', '/dashboard')
    resolve(new Response(JSON.stringify({ success: true, message: 'Subscribed' }), { status: 201 }))
    await screen.findByText("You're subscribed!")
    expect(trackNewsletterEvent).toHaveBeenCalledExactlyOnceWith('newsletter_submit')
  })
  it('does not emit attempts for invalid input', async () => {
    const user = userEvent.setup()
    render(<SubscribeForm />)
    await user.click(screen.getByRole('button', { name: 'Subscribe' }))
    await screen.findByText('Enter a valid email address')
    expect(trackNewsletterEvent).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('allows retry after a network failure without creating a conversion for the failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await submit()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled())
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, message: 'Subscribed' }), { status: 201 }))
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe' }))
    await screen.findByText("You're subscribed!")
    expect(vi.mocked(trackNewsletterEvent).mock.calls.map(([name]) => name)).toEqual([
      'newsletter_submit', 'newsletter_submit', 'newsletter_subscribe',
    ])
  })
})

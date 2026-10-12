import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Analytics } from '@/components/analytics/Analytics'
import { AnalyticsPage } from '@/components/analytics/AnalyticsPage'
import { getConsent } from '@/lib/analytics/consent'

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
const config = { measurementId: 'G-TEST123', origin: window.location.origin }

beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/blog/article') })
afterEach(cleanup)

it('offers opt-in/rejection, permits later opt-in, and keeps withdrawal accessible', async () => {
  const { rerender } = render(<><AnalyticsPage pathname="/blog/article" title="Public article" /><Analytics config={config} /></>)
  const user = userEvent.setup()
  expect(document.querySelector('#tpe-google-analytics')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'No thanks' }))
  expect(getConsent()).toBe('denied')
  expect(document.querySelector('#tpe-google-analytics')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Allow analytics' }))
  expect(getConsent()).toBe('granted')
  await waitFor(() => expect(document.querySelectorAll('#tpe-google-analytics')).toHaveLength(1))
  const script = document.querySelector('#tpe-google-analytics')
  rerender(<><AnalyticsPage pathname="/blog/article" title="Public article" /><Analytics config={{ ...config }} /></>)
  expect(document.querySelector('#tpe-google-analytics')).toBe(script)
  await user.click(screen.getByRole('button', { name: 'Turn off analytics' }))
  expect(getConsent()).toBe('denied')
  expect(screen.getByText('Optional Google Analytics is off.')).toBeInTheDocument()
})

it('does not render preference controls on private routes', () => {
  history.replaceState(null, '', '/login')
  render(<Analytics config={config} />)
  expect(screen.queryByRole('region', { name: 'Analytics preferences' })).not.toBeInTheDocument()
  expect(document.querySelector('#tpe-google-analytics')).toBeNull()
})

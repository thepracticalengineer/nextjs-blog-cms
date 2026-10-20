import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/auth/session', () => ({ requireAuth: vi.fn() }))
import { requireAuth } from '@/lib/auth/session'
import { RetiredWorkspace } from '@/components/dashboard/RetiredWorkspace'
afterEach(cleanup)
it.each(['admin', 'author', 'reader'])('shows only permitted provider navigation for %s', async role => {
  vi.mocked(requireAuth).mockResolvedValue({ id: 'owner', role } as Awaited<ReturnType<typeof requireAuth>>)
  render(await RetiredWorkspace())
  expect(screen.getByRole('heading', { name: 'This workspace has been retired' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Open your articles' })).toHaveAttribute('href', '/dashboard/posts')
  const settings = screen.queryByRole('link', { name: 'Settings → AI Providers' })
  if (role === 'reader') expect(settings).not.toBeInTheDocument()
  else expect(settings).toHaveAttribute('href', '/dashboard/settings/ai-providers')
})

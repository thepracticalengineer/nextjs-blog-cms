import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`) }) }))
vi.mock('@/lib/auth/session', () => ({ requireAuth: mocks.auth }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }) }) }) }))
import Entry from '@/app/(dashboard)/dashboard/onboarding/entry/page'
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ id: 'owner' }) })
it('redirects a failed lookup to the retry page without exposing provider data', async () => {
  mocks.read.mockResolvedValue({ data: null, error: { message: 'private provider data' } })
  await expect(Entry({ searchParams: Promise.resolve({ next: '/blog/article#comments' }) })).rejects.toThrow('redirect:/onboarding-unavailable?next=%2Fblog%2Farticle%23comments')
})
it('keeps normal exempt-account redirects outside the outage catch', async () => {
  mocks.read.mockResolvedValue({ data: null, error: null })
  await expect(Entry({ searchParams: Promise.resolve({ next: '/blog' }) })).rejects.toThrow('redirect:/blog')
})

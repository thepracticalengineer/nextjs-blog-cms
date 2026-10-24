import { describe, expect, it, vi } from 'vitest'
import { onboardingDestination } from '@/features/onboarding/routing'
const query = (data: unknown, error: unknown = null) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error }) }) }) }) })
describe('post-auth onboarding destination', () => {
  it('routes future accounts through onboarding and retains the intended public page', async () => {
    expect(await onboardingDestination(query({ completed_at: null }) as never, 'user', '/blog/article#comments')).toBe('/dashboard/onboarding?next=%2Fblog%2Farticle%23comments')
  })
  it('leaves exempt and completed accounts at a validated destination', async () => {
    for (const data of [null, { completed_at: 'today' }]) expect(await onboardingDestination(query(data) as never, 'user', '/blog')).toBe('/blog')
    expect(await onboardingDestination(query(null) as never, 'user', '//evil')).toBe('/dashboard')
  })
  it('fails closed on unreadable progress', async () => {
    await expect(onboardingDestination(query(null, { message: 'offline' }) as never, 'user', '/blog')).rejects.toThrow('onboarding')
  })
  it('does not turn a database rejection into an exemption', async () => {
    const client = { from: vi.fn(() => { throw Error('network') }) }
    await expect(onboardingDestination(client as never, 'user', '/dashboard')).rejects.toThrow()
  })
})

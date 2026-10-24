import { describe, expect, it } from 'vitest'
import { onboardingSchema, onboardingReturnPath, onboardingAfterMfa } from '@/features/onboarding/validation'
const valid = { full_name: 'Jane', original_name: 'Jane', experience: '1-3', profession: 'software-engineer', referral: '', interests: [], step: 1, revision: 0, complete: false }
describe('onboarding boundaries', () => {
  it('requires profile context before advancing', () => {
    expect(onboardingSchema.safeParse({ ...valid, experience: '' }).success).toBe(false)
    expect(onboardingSchema.safeParse({ ...valid, profession: 'admin' }).success).toBe(false)
    expect(onboardingSchema.safeParse({ ...valid, full_name: '  ' }).success).toBe(false)
  })
  it('allows partial answers when navigating back', () => {
    expect(onboardingSchema.safeParse({ ...valid, step: 0, experience: '', profession: '' }).success).toBe(true)
  })
  it('bounds interests, revisions and steps and rejects unknown fields', () => {
    for (const patch of [{ interests: ['invalid'] }, { revision: -1 }, { step: 3 }, { role: 'admin' }, { interests: Array(33).fill('00000000-0000-4000-8000-000000000001') }]) {
      expect(onboardingSchema.safeParse({ ...valid, ...patch }).success).toBe(false)
    }
  })
  it('keeps safe destinations but rejects onboarding loops and external paths', () => {
    expect(onboardingReturnPath('/blog/article?x=1#comments')).toBe('/blog/article?x=1#comments')
    for (const path of ['/dashboard/onboarding', '/dashboard/onboarding/entry?next=/blog', '//evil.test', '/reset-password', '/dashboard/%6fnboarding']) expect(onboardingReturnPath(path)).toBe('/dashboard')
  })
})

it('preserves the intended public destination through nested MFA entry navigation', () => {
  expect(onboardingAfterMfa('/dashboard/onboarding/entry?next=%2Fblog')).toBe('/dashboard/onboarding/entry?next=%2Fblog')
  expect(onboardingAfterMfa('/blog')).toBe('/dashboard/onboarding/entry?next=%2Fblog')
})

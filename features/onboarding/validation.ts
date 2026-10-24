import { z } from 'zod'
import { safeReturnPath } from '@/lib/auth/navigation'

export const experiences = [
  ['learning', 'Just getting started'], ['under-1', 'Less than 1 year'], ['1-3', '1–3 years'],
  ['3-5', '3–5 years'], ['5-10', '5–10 years'], ['10-plus', '10+ years'],
] as const
export const professions = [
  ['software-engineer', 'Software engineer'], ['engineering-manager', 'Engineering manager'],
  ['founder', 'Founder'], ['devops-engineer', 'DevOps engineer'], ['ai-engineer', 'AI engineer'],
  ['data-engineer', 'Data engineer'], ['student', 'Student'], ['product-manager', 'Product manager'],
  ['designer', 'Designer'], ['other', 'Other'],
] as const
export const referrals = [
  ['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['search', 'Search engine'],
  ['friend', 'Friend or colleague'], ['newsletter', 'Blog or newsletter'], ['other', 'Other'], ['unknown', "I don't remember"],
] as const
const choice = (choices: ReadonlyArray<readonly [string, string]>) => z.string().refine(value => !value || choices.some(([id]) => id === value), 'Choose one of the listed options.')
export const onboardingSchema = z.object({
  full_name: z.string().trim().max(120), original_name: z.string().nullable(),
  experience: choice(experiences), profession: choice(professions), referral: choice(referrals),
  interests: z.array(z.uuid()).max(32), step: z.number().int().min(0).max(2),
  revision: z.number().int().min(0), complete: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.step > 0 || value.complete) {
    for (const key of ['full_name', 'experience', 'profession'] as const) {
      if (!value[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'This answer is required.' })
    }
  }
})
export type OnboardingInput = z.infer<typeof onboardingSchema>
export type OnboardingProgress = {
  user_id: string; step: number; revision: number; full_name: string | null; profile_name: string | null;
  experience: string; profession: string; referral: string; interests: string[];
  return_to: string | null; completed_at: string | null;
}
export function onboardingReturnPath(value: unknown): string {
  const path = safeReturnPath(value)
  return /^\/dashboard\/onboarding(?:\/|$)/.test(decodeURIComponent(path.split(/[?#]/)[0])) ? '/dashboard' : path
}
export function onboardingEntry(value: unknown): string {
  return `/dashboard/onboarding/entry?next=${encodeURIComponent(onboardingReturnPath(value))}`
}

/** An MFA challenge may already be carrying the entry page and its nested next. */
export function onboardingAfterMfa(value: unknown): string {
  const safe = safeReturnPath(value)
  const pathname = new URL(safe, 'https://internal.invalid').pathname
  return ['/dashboard/onboarding', '/dashboard/onboarding/entry'].includes(pathname) ? safe : onboardingEntry(safe)
}

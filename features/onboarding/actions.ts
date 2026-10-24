'use server'

import { revalidatePath } from 'next/cache'
import { authorizeSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { onboardingSchema, type OnboardingProgress } from './validation'

export type OnboardingResult = { progress?: OnboardingProgress; error?: string; conflict?: boolean }
export async function saveOnboarding(input: unknown): Promise<OnboardingResult> {
  const { profile, failure } = await authorizeSession()
  if (!profile) return { error: failure?.error ?? 'Sign in again, then retry.' }
  const parsed = onboardingSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('save_onboarding', { p_answers: parsed.data })
    if (error?.code === '40001') return { error: 'Your profile or progress changed in another tab. Reload saved progress to continue.', conflict: true }
    if (error || !data) return { error: error?.code === '22023' ? 'Check your answers and choose at least one available topic before finishing. Reload if the available topics changed.' : 'Unable to save. Your answers are still here; try again.' }
    if (data.completed_at) revalidatePath('/dashboard', 'layout')
    return { progress: data as OnboardingProgress }
  } catch {
    return { error: 'Unable to save. Your answers are still here; try again.' }
  }
}

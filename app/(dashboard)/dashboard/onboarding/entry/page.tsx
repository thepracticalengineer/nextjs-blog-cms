import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { onboardingDestination } from '@/features/onboarding/routing'
import { onboardingEntry, onboardingReturnPath } from '@/features/onboarding/validation'

export default async function OnboardingEntry({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  const profile = await requireAuth(onboardingEntry(next))
  let destination: string
  try {
    destination = await onboardingDestination(await createClient(), profile.id, next)
  } catch {
    redirect(`/onboarding-unavailable?next=${encodeURIComponent(onboardingReturnPath(next))}`)
  }
  redirect(destination)
}

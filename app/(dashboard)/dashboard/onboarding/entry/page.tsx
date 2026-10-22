import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { onboardingDestination } from '@/features/onboarding/routing'
import { onboardingEntry } from '@/features/onboarding/validation'

export default async function OnboardingEntry({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  const profile = await requireAuth(onboardingEntry(next))
  redirect(await onboardingDestination(await createClient(), profile.id, next))
}

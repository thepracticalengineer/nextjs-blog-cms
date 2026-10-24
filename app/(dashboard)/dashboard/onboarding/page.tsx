import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { requireAuth } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { OnboardingForm } from '@/features/onboarding/OnboardingForm'
import { onboardingReturnPath, type OnboardingProgress } from '@/features/onboarding/validation'

export const metadata: Metadata = { title: 'Welcome · Set up your account', robots: { index: false, follow: false } }
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  const destination = onboardingReturnPath(next)
  const profile = await requireAuth(`/dashboard/onboarding?next=${encodeURIComponent(destination)}`)
  const client = await createClient()
  const [state, topics] = await Promise.all([
    client.rpc('start_onboarding', { p_destination: destination }),
    client.from('tags').select('id,name').is('merged_into', null).order('name'),
  ])
  if (state.error || topics.error) redirect(`/onboarding-unavailable?next=${encodeURIComponent(destination)}`)
  const progress = state.data as OnboardingProgress | null
  if (!progress || progress.completed_at) redirect(onboardingReturnPath(progress?.return_to ?? destination))
  return <OnboardingForm progress={progress} profile={{ full_name: profile.full_name, email: profile.email, avatar_url: profile.avatar_url }} tags={topics.data ?? []} />
}

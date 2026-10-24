import Link from 'next/link'
import type { Metadata } from 'next'
import { onboardingEntry } from '@/features/onboarding/validation'

export const metadata: Metadata = { title: 'Account setup temporarily unavailable', robots: { index: false, follow: false } }
/** No private data or database lookup: this page must render during an outage. */
export default async function OnboardingUnavailable({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return <section className="space-y-5 p-8">
    <h1 className="text-2xl font-semibold">Account setup is temporarily unavailable</h1>
    <p className="text-muted-foreground">We could not load your account setup. Your saved answers are safe. Please try again.</p>
    <Link href={onboardingEntry(next)} prefetch={false} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2">Try again</Link>
  </section>
}

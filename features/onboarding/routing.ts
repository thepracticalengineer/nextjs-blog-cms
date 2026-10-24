import type { SupabaseClient } from '@supabase/supabase-js'
import { onboardingReturnPath } from './validation'

/** Call only after checking authoritative identity and required assurance. */
export async function onboardingDestination(client: SupabaseClient, userId: string, value: unknown, pending = true): Promise<string> {
  const next = onboardingReturnPath(value)
  if (!pending) return next
  const { data, error } = await client.from('onboarding_progress').select('completed_at').eq('user_id', userId).maybeSingle()
  if (error) throw new Error('Unable to check onboarding. Please retry.')
  return data && !data.completed_at ? `/dashboard/onboarding?next=${encodeURIComponent(next)}` : next
}

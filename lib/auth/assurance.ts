import type { SupabaseClient, User } from '@supabase/supabase-js'

export type AssuranceFailure = 'MFA_REQUIRED' | 'AUTH_UNAVAILABLE'

/** Verified getUser factors override potentially stale session factor metadata. */
export async function checkAssurance(client: SupabaseClient, user: User): Promise<AssuranceFailure | null> {
  try {
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error || !data || !['aal1', 'aal2'].includes(data.currentLevel ?? '') ||
      !['aal1', 'aal2'].includes(data.nextLevel ?? '')) return 'AUTH_UNAVAILABLE'
    const enrolled = user.factors?.some(factor => factor.status === 'verified')
    return (enrolled || data.nextLevel === 'aal2') && data.currentLevel !== 'aal2'
      ? 'MFA_REQUIRED' : null
  } catch {
    return 'AUTH_UNAVAILABLE'
  }
}

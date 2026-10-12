import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { can } from '@/lib/permissions'
import type { Permission, Role } from '@/lib/permissions'
import type { Profile } from '@/lib/supabase/types'
import { checkAssurance } from '@/lib/auth/assurance'
import { mfaDestination } from '@/lib/auth/navigation'

export type AuthorizationFailure = {
  code: 'UNAUTHENTICATED' | 'MFA_REQUIRED' | 'AUTH_UNAVAILABLE' | 'FORBIDDEN'
  status: 401 | 403 | 503
  error: string
}
export type SessionAuthorization =
  | { profile: Profile; failure: null }
  | { profile: null; failure: AuthorizationFailure }

/** Identity, assurance and role must be checked before privileged data access. */
export async function authorizeSession(permission?: Permission): Promise<SessionAuthorization> {
  // cookies() can signal dynamic rendering during a Next.js build. Keep client
  // construction outside the provider-failure catch so Next can handle it.
  const supabase = await createClient()
  const unavailable: SessionAuthorization = { profile: null, failure: {
    code: 'AUTH_UNAVAILABLE', status: 503, error: 'Authentication could not be verified. Try again shortly.',
  } }
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error && error.name !== 'AuthSessionMissingError' && error.status !== 401) return unavailable
    if (error || !user) return { profile: null, failure: { code: 'UNAUTHENTICATED', status: 401, error: 'Sign in again, then retry.' } }
    const assurance = await checkAssurance(supabase, user)
    if (assurance === 'AUTH_UNAVAILABLE') return unavailable
    if (assurance) return { profile: null, failure: {
      code: 'MFA_REQUIRED', status: 403, error: 'Complete two-factor authentication, then retry.',
    } }
    const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (profileError) return unavailable
    if (!profile || (permission && !can(profile.role as Role, permission))) {
      return { profile: null, failure: { code: 'FORBIDDEN', status: 403, error: 'Forbidden' } }
    }
    return { profile, failure: null }
  } catch {
    return unavailable
  }
}

/** Compatibility guard for actions: every failure denies access. */
export async function getProfile(): Promise<Profile | null> {
  return (await authorizeSession()).profile
}

/**
 * Returns an authorized profile, redirects for sign-in/MFA, or fails on outages.
 * Use this in pages and layouts that require authentication.
 */
export async function requireAuth(next = '/dashboard'): Promise<Profile> {
  const { profile, failure } = await authorizeSession()
  if (failure?.code === 'MFA_REQUIRED') redirect(mfaDestination(next))
  // An outage cannot be solved by another MFA challenge; avoid redirect loops.
  if (failure?.code === 'AUTH_UNAVAILABLE') throw new Error(failure.error)
  if (!profile) redirect('/login')
  return profile
}

/**
 * Returns the current user's profile if they have the given permission,
 * redirects to /login if not authenticated, or to /dashboard if unauthorized.
 * Use this in pages and actions that require a specific role/permission.
 */
export async function requirePermission(permission: Permission): Promise<Profile> {
  const profile = await requireAuth()
  if (!can(profile.role as Role, permission)) redirect('/dashboard')
  return profile
}

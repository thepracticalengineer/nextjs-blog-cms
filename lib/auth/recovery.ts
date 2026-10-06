import 'server-only'
import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const RECOVERY_COOKIE = 'password-recovery'
export const RECOVERY_TTL_SECONDS = 15 * 60
export const RECOVERY_ERROR = 'This reset link is missing, expired, invalid, or already used. Request a new link to try again.'

// Only called after Supabase verifies an OTP with type: 'recovery'. Ordinary
// signup/login callbacks must never mint a recovery grant.
export async function createRecoveryGrant(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getClaims()
  const userId = data?.claims.sub
  const sessionId = data?.claims.session_id
  if (error || !userId || typeof sessionId !== 'string') throw new Error('Invalid recovery session')

  const service = createServiceClient()
  // The expiry index keeps this opportunistic global sweep cheap. Abandoned
  // grants are removed on subsequent recoveries without an extra scheduled job.
  const { error: cleanupError } = await service.from('password_recovery_grants')
    .delete().lt('expires_at', new Date().toISOString())
  if (cleanupError) throw new Error('Unable to maintain recovery grants')

  const id = randomUUID()
  const { error: insertError } = await service.from('password_recovery_grants').insert({
    id,
    user_id: userId,
    session_id: sessionId,
    expires_at: new Date(Date.now() + RECOVERY_TTL_SECONDS * 1000).toISOString(),
  })
  if (insertError) throw new Error('Unable to authorize recovery')
  const cookieStore = await cookies()
  cookieStore.set(RECOVERY_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: RECOVERY_TTL_SECONDS,
  })
}

export async function clearRecoveryGrant() {
  const cookieStore = await cookies()
  cookieStore.delete(RECOVERY_COOKIE)
}

// The default SSR clients use sb-<project>-auth-token cookies, including
// numbered chunks. Clear browser credentials even when Auth sign-out is down.
export async function clearRecoveryAuthCookies() {
  const cookieStore = await cookies()
  for (const cookie of cookieStore.getAll()) {
    if (/^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name)) cookieStore.delete(cookie.name)
  }
}

export async function getRecoveryContext() {
  const cookieStore = await cookies()
  const id = cookieStore.get(RECOVERY_COOKIE)?.value
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null

  const supabase = await createClient()
  // getUser asks Auth to validate the session, rather than trusting browser cookies.
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const sessionId = claimsData?.claims.session_id
  if (claimsError || typeof sessionId !== 'string' || claimsData?.claims.sub !== user.id) return null

  return { id, userId: user.id, sessionId, supabase }
}

export async function hasRecoveryGrant() {
  try {
    const context = await getRecoveryContext()
    if (!context) return false
    const { data, error } = await createServiceClient().from('password_recovery_grants')
      .select('id').eq('id', context.id).eq('user_id', context.userId)
      .eq('session_id', context.sessionId).gt('expires_at', new Date().toISOString()).maybeSingle()
    return !error && !!data
  } catch {
    return false
  }
}

// DELETE ... RETURNING consumes the grant atomically, including concurrent submits
// and replay of an old cookie. A UI flag or a signed cookie alone cannot do this.
export async function consumeRecoveryGrant() {
  const context = await getRecoveryContext()
  if (!context) return null
  const { data, error } = await createServiceClient().from('password_recovery_grants')
    .delete().eq('id', context.id).eq('user_id', context.userId)
    .eq('session_id', context.sessionId).gt('expires_at', new Date().toISOString()).select('id').maybeSingle()
  return !error && data ? context.supabase : null
}

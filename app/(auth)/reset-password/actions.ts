'use server'

import { resetPasswordSchema } from '@/lib/auth/password-policy'
import { clearRecoveryAuthCookies, clearRecoveryGrant, consumeRecoveryGrant, getRecoveryContext, hasRecoveryGrant, RECOVERY_ERROR } from '@/lib/auth/recovery'

export async function resetPassword(formData: FormData) {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    // Verify MFA before consuming the single-use capability. Invalid codes may
    // be retried, but no password update can bypass the final atomic consume.
    if (!await hasRecoveryGrant()) return { error: RECOVERY_ERROR, invalidRecovery: true }
    const context = await getRecoveryContext()
    if (!context) return { error: RECOVERY_ERROR, invalidRecovery: true }
    const { data: assurance, error: assuranceError } = await context.supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assuranceError || !assurance) return { error: 'Unable to check two-factor verification. Please try again.' }
    if (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
      const { data: factors, error: factorsError } = await context.supabase.auth.mfa.listFactors()
      if (factorsError) return { error: 'Unable to load your authenticators. Please try again.', mfaRequired: true }
      const authenticators = factors.totp.filter(factor => factor.status === 'verified')
      if (!authenticators.length) return {
        error: 'This account requires a verification method that password recovery does not support. Contact an administrator for help.',
        invalidRecovery: true, mfaBlocked: true,
      }
      const code = formData.get('code')
      const requestedFactor = formData.get('factorId')
      const factor = authenticators.find(item => item.id === requestedFactor) ?? authenticators[0]
      const choices = authenticators.map(item => ({ id: item.id, name: item.friendly_name || 'Authenticator' }))
      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return {
        error: 'Enter the six-digit code from your authenticator app.', mfaRequired: true, factors: choices,
      }
      const { error: verificationError } = await context.supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
      if (verificationError) return {
        error: verificationError.status === 429
          ? 'Too many verification attempts. Please wait before trying again.'
          : 'That verification code is invalid or expired. Try the current code from your authenticator app.',
        mfaRequired: true, factors: choices,
      }
    }
    const supabase = await consumeRecoveryGrant()
    await clearRecoveryGrant()
    if (!supabase) return { error: RECOVERY_ERROR, invalidRecovery: true }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
    // The grant stays consumed even on provider failure. MFA needs administrator
    // guidance; other errors offer a fresh email without allowing a replay.
    if (error) {
      if (error.code === 'insufficient_aal') {
        return {
          error: 'This account requires two-factor verification before its password can be changed. Contact an administrator for help; another reset email will not resolve this.',
          invalidRecovery: true,
          mfaBlocked: true,
        }
      }
      const message = error.code === 'weak_password'
        ? 'This password does not meet the account password requirements. This reset link has been used. Request a new link and choose a stronger password.'
        : error.code === 'same_password'
          ? 'Choose a password different from your current password.'
          : error.status === 429
            ? 'Too many requests. Please wait before requesting another reset link.'
            : 'Unable to update your password. Request a new link and try again.'
      return { error: message, invalidRecovery: true }
    }
    // End recovery and other refresh sessions; the user signs in with the new password.
    try {
      await supabase.auth.signOut({ scope: 'global' })
    } catch {
      // The password was already updated; an outage must not report it as failed.
    }
    await clearRecoveryAuthCookies()
    return { success: true }
  } catch {
    return { error: 'Unable to update your password. Request a new link and try again.', invalidRecovery: true }
  }
}

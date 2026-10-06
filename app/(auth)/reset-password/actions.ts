'use server'

import { resetPasswordSchema } from '@/lib/auth/password-policy'
import { clearRecoveryAuthCookies, clearRecoveryGrant, consumeRecoveryGrant, RECOVERY_ERROR } from '@/lib/auth/recovery'

export async function resetPassword(formData: FormData) {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
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

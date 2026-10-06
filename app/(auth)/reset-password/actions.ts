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
    // The grant stays consumed even on provider failure. Never allow a replay;
    // the actionable error offers a fresh email instead.
    if (error) {
      const message = error.code === 'weak_password'
        ? 'This password does not meet the account password requirements.'
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

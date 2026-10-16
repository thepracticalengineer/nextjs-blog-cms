'use server'

import type { AuthActionResult } from '@/lib/auth/abuse-feedback'
import { authAbuseBlock } from '@/lib/auth/abuse'

import { createClient } from '@/lib/supabase/server'
import { recoveryEmailSchema } from '@/lib/auth/password-policy'
import { CONFIRMATION_COOLDOWN_SECONDS, signupCallbackUrl } from '@/lib/auth/confirmation'

export async function resendConfirmation(formData: FormData): Promise<AuthActionResult> {
  const email = recoveryEmailSchema.safeParse(formData.get('email'))
  if (!email.success) return { error: 'Enter a valid email address' }

  try {
    const emailRedirectTo = signupCallbackUrl()
    const blocked = await authAbuseBlock('confirmation', email.data, formData.get('captchaToken'))
    if (blocked) return blocked
    const supabase = await createClient()
    // Supabase enforces the per-address send interval across clients/instances.
    // Neither provider errors nor success imply that an account exists or mail
    // was delivered. Keep every provider response identical, including throttles.
    await supabase.auth.resend({ type: 'signup', email: email.data, options: { emailRedirectTo } })
    return { success: true, retryAfter: CONFIRMATION_COOLDOWN_SECONDS }
  } catch (error) {
    // Auth API errors are neutral just like returned Auth responses. Transport
    // failures still offer retry guidance without claiming delivery.
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
    if (status === 429 || code === 'email_not_found' || code === 'user_already_exists' || code === 'over_email_send_rate_limit') {
      return { success: true, retryAfter: CONFIRMATION_COOLDOWN_SECONDS }
    }
    return { error: 'Unable to request a confirmation link right now. Please try again later.' }
  }
}

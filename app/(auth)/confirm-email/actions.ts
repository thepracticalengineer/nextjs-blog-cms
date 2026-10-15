'use server'

import { createClient } from '@/lib/supabase/server'
import { recoveryEmailSchema } from '@/lib/auth/password-policy'
import { CONFIRMATION_COOLDOWN_SECONDS, signupCallbackUrl } from '@/lib/auth/confirmation'

export async function resendConfirmation(formData: FormData) {
  const email = recoveryEmailSchema.safeParse(formData.get('email'))
  if (!email.success) return { error: 'Enter a valid email address' }

  try {
    const emailRedirectTo = signupCallbackUrl()
    const supabase = await createClient()
    // Supabase enforces the per-address send interval across clients/instances.
    // Neither provider errors nor success imply that an account exists or mail
    // was delivered. Keep every provider response identical, including throttles.
    await supabase.auth.resend({ type: 'signup', email: email.data, options: { emailRedirectTo } })
    return { success: true, retryAfter: CONFIRMATION_COOLDOWN_SECONDS }
  } catch {
    return { error: 'Unable to request a confirmation link right now. Please try again later.' }
  }
}

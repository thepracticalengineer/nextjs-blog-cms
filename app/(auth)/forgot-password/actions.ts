'use server'

import { createClient } from '@/lib/supabase/server'
import { recoveryEmailSchema } from '@/lib/auth/password-policy'

export async function requestPasswordReset(formData: FormData) {
  const parsed = recoveryEmailSchema.safeParse(formData.get('email'))
  if (!parsed.success) return { error: 'Enter a valid email address' }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    if (!baseUrl) return { error: 'Password recovery is temporarily unavailable. Please try again later.' }
    const supabase = await createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: new URL('/auth/callback?next=/reset-password', baseUrl).toString(),
    })
    // Email-specific throttling must not disclose whether this address exists.
    if (error?.code === 'over_email_send_rate_limit' || error?.code === 'email_not_found') return { success: true }
    if (error?.status === 429) return { error: 'Too many requests. Please wait a few minutes before trying again.' }
    if (error) return { error: 'Unable to request a reset email right now. Please try again later.' }
    return { success: true }
  } catch {
    return { error: 'Unable to request a reset email right now. Please try again later.' }
  }
}

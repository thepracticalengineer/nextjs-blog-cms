export type AuthAbuseFeedback = { error: string; retryAfter?: number; captchaRequired?: true }

/** Callers mask address-specific email outcomes before applying this generic cooldown. */
export function providerCooldown(error: unknown): AuthAbuseFeedback | null {
  const { code, status } = error && typeof error === 'object' ? error as { code?: string; status?: number } : {}
  return status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit'
    ? { error: 'Too many attempts. Wait a few minutes before trying again.', retryAfter: 60 }
    : null
}

export type AuthActionResult = {
  error?: string
  retryAfter?: number
  captchaRequired?: true
  success?: true
  needsConfirmation?: true
}

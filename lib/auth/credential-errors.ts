const connectionMessage = 'Unable to connect. Check your connection and try again.'

/** Never render provider messages or disclose account existence/confirmation state. */
export function credentialErrorMessage(error: unknown, mode: 'login' | 'signup', thrown = false): string {
  const { code, status } = error && typeof error === 'object'
    ? error as { code?: string; status?: number } : {}
  if (status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') {
    return 'Too many attempts. Wait a few minutes before trying again.'
  }
  if (code === 'request_timeout' || code === 'unexpected_failure' || (status !== undefined && status >= 500)) {
    return 'Authentication is temporarily unavailable. Please try again later.'
  }
  if (code === 'weak_password' && mode === 'signup') {
    return 'Choose a stronger password and try again.'
  }
  if (code === 'signup_disabled' || code === 'email_provider_disabled') {
    return 'Email authentication is temporarily unavailable. Please try again later.'
  }
  if (thrown && !code) return connectionMessage
  return mode === 'login'
    ? 'Unable to sign in. Check your email and password, or request a confirmation link if needed.'
    : 'Unable to create an account. Try again, or sign in or request a confirmation link if you already registered.'
}

/** Safe, actionable messages shared by sign-in and authenticator setup. */
export function mfaErrorMessage(error: unknown, fallback = 'Two-factor verification is temporarily unavailable. Please try again.'): string {
  const { code, status } = error && typeof error === 'object'
    ? error as { code?: string; status?: number } : {}
  if (status === 429 || code === 'over_request_rate_limit') {
    return 'Too many attempts. Wait a few minutes before trying again.'
  }
  switch (code) {
    case 'mfa_verification_failed':
      return 'Invalid code — wait for a new code from your authenticator and try again.'
    case 'mfa_challenge_expired':
      return 'Verification expired. Enter a fresh code and try again.'
    case 'mfa_factor_not_found':
      return 'This authenticator is no longer available. Reload authenticators and select another, or contact your site administrator.'
    case 'session_not_found':
    case 'refresh_token_not_found':
    case 'refresh_token_already_used':
      return 'Your session has expired. Sign out and sign in again.'
    case 'mfa_verification_rejected':
      return 'Verification was rejected. Contact your site administrator for help.'
    default:
      return status === 401 ? 'Your session has expired. Sign out and sign in again.' : fallback
  }
}

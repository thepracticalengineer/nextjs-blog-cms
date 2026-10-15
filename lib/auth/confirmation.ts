export const SIGNUP_CALLBACK_PATH = '/auth/callback?type=signup'
export const CONFIRMATION_COOLDOWN_SECONDS = 60
export const CONFIRMATION_SENT = 'If this email belongs to an account awaiting confirmation, you’ll receive a new confirmation link. Check your inbox and spam folder.'

/** Only deployment configuration may choose the email destination. */
export function signupCallbackUrl() {
  const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? '')
  if (site.username || site.password || (site.protocol !== 'https:' &&
    !(site.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(site.hostname)))) {
    throw new Error('Invalid signup site URL')
  }
  return new URL(SIGNUP_CALLBACK_PATH, site.origin).toString()
}

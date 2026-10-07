import 'server-only'

export function getNewsletterDelayMinutes(): number {
  const parsed = Number(process.env.NEWSLETTER_DELAY_MINUTES?.trim() || 60)
  return Number.isSafeInteger(parsed) && parsed >= 0 &&
    Number.isFinite(new Date(Date.now() + parsed * 60000).getTime()) ? parsed : 60
}

/** Keep aligned with pages_private.available_slug in the URL migration.
 * Reserve root namespaces, including directories containing static assets.
 * Dots, underscores and separators are excluded by the canonical slug grammar.
 */
export const reservedPageSlugs = new Set([
  'blog', 'dashboard', 'authors', 'api', 'auth', 'login', 'register', 'mfa',
  'forgot-password', 'reset-password', 'confirm-email', 'onboarding-unavailable',
  'newsletter', 'screenshots', 'sitemap', 'robots', 'favicon',
])
export function isPageSlug(value: string): boolean {
  return value.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && !reservedPageSlugs.has(value)
}
/** Next has decoded the segment already. Never decode twice or accept a slash. */
export function normalizePagePath(value: string): string | null {
  const canonical = value.toLowerCase()
  return isPageSlug(canonical) ? canonical : null
}

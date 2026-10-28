export type PageResult<T> = { data: T; error: null } | { data: null; error: { code: string; message: string } }
const messages = {
  PAGE_INVALID_INPUT: 'The page request is invalid. No changes were saved.',
  PAGE_INVALID_DOCUMENT: 'The page document is invalid or unsupported. No changes were saved.',
  PAGE_UNSUPPORTED_DOCUMENT: 'This page uses an invalid or unsupported document. Upgrade support before opening it.',
  PAGE_STALE: 'This page changed elsewhere. Reload it before trying again.',
  PAGE_RETRY_CONFLICT: 'This request key was already used with different input. Use a new key for a new operation.',
  PAGE_SLUG_CONFLICT: 'This slug is reserved by another page. Choose another slug.',
  PAGE_FORBIDDEN: 'You do not have permission to manage pages.',
  PAGE_NOT_FOUND: 'The page no longer exists.',
  PAGE_UNAVAILABLE: 'The page operation could not be confirmed. Retry the same request key and input.',
} as const
export function pageFailure(code: keyof typeof messages): { data: null; error: { code: string; message: string } } {
  return { data: null, error: { code, message: messages[code] } }
}
export function pageDatabaseFailure(error: { message: string }) {
  const code = error.message
  return pageFailure(Object.hasOwn(messages, code) ? code as keyof typeof messages : 'PAGE_UNAVAILABLE')
}

import type { PageResult } from '../errors'
import type { Page, PageWrite } from '../schema'

type WriteError = NonNullable<PageResult<never>['error']>
const rejectedWrites = new Set(['PAGE_INVALID_INPUT', 'PAGE_INVALID_DOCUMENT', 'PAGE_STALE', 'PAGE_RETRY_CONFLICT', 'PAGE_SLUG_CONFLICT', 'PAGE_NOT_READY', 'PAGE_REVIEW_REQUIRED', 'PAGE_NOT_FOUND'])

/** A preflight rejection only establishes the outcome of this attempt. An older
 * attempt may have committed before its acknowledgement was lost. */
export function canCorrectWrite(error: WriteError, retrying: boolean): boolean {
  return rejectedWrites.has(error.code) || (error.writeAttempted === false && !retrying)
}

export function writeErrorMessage(error: WriteError, retrying: boolean): string {
  if (error.code === 'PAGE_IMAGE_NOT_ALLOWED' && !canCorrectWrite(error, retrying)) {
    return `${error.message} An earlier write may have completed. Restore the configured image host, then retry this same request to confirm its result.`
  }
  return error.message
}

export function writeSuccessMessage(operation: PageWrite['operation'], replayed: boolean): string {
  if (replayed) return 'Request confirmed. Your input is preserved; compare it with the latest saved page before saving again.'
  if (operation === 'publish') return 'Published snapshot updated. Public routing is pending #289.'
  if (operation === 'unpublish') return 'Page unpublished. Your working content is preserved.'
  return 'Draft saved. Published content is unchanged.'
}

export function editorStatus(busy: boolean, pending: boolean, dirty: boolean, page: Page | null): string {
  if (busy) return 'Saving…'
  if (pending) return 'Request awaiting confirmation'
  if (dirty) return 'Unsaved changes'
  if (page) return `Saved · ${page.status}`
  return 'New private draft'
}

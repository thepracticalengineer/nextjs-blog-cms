import type { PageResult } from '../errors'
import type { Page, PageWrite } from '../schema'

type WriteError = NonNullable<PageResult<never>['error']>
const rejectedWrites = new Set(['PAGE_RESERVED_URL', 'PAGE_URL_CONFIRMATION_REQUIRED', 'PAGE_INVALID_INPUT', 'PAGE_INVALID_DOCUMENT', 'PAGE_STALE', 'PAGE_RETRY_CONFLICT', 'PAGE_SLUG_CONFLICT', 'PAGE_NOT_READY', 'PAGE_REVIEW_REQUIRED', 'PAGE_NOT_FOUND', 'PAGE_REVISION_NOT_FOUND', 'PAGE_TRASHED', 'PAGE_NOT_TRASHED', 'PAGE_HAS_CHILDREN', 'PAGE_PARENT_TRASHED', 'PAGE_PARENT_NOT_FOUND', 'PAGE_HIERARCHY_CYCLE', 'PAGE_HIERARCHY_TOO_DEEP', 'PAGE_DELETE_CONFIRMATION_REQUIRED'])

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
  if (operation === 'publish') return 'Published snapshot updated. Your page is live.'
  if (operation === 'unpublish') return 'Page unpublished. Your working content is preserved.'
  if (operation === 'trash') return 'Moved to trash. The page is unpublished and its URLs stay reserved.'
  if (operation === 'recover') return 'Restored from trash as an unpublished draft. Review and publish it to make it live again.'
  if (operation === 'purge') return 'Page permanently deleted. Its URLs stay reserved and cannot be reused.'
  if (operation === 'move') return 'Page moved. Its URL is unchanged.'
  if (operation === 'restore') return 'Revision restored as the working draft. Published content is unchanged until you review and publish it.'
  return 'Draft saved. Published content is unchanged.'
}

export function editorStatus(busy: boolean, pending: boolean, dirty: boolean, page: Page | null): string {
  if (busy) return 'Saving…'
  if (pending) return 'Request awaiting confirmation'
  if (page?.purged_at) return 'Permanently deleted'
  if (page?.trashed_at) return 'In trash'
  if (dirty) return 'Unsaved changes'
  if (page) return `Saved · ${page.status}`
  return 'New private draft'
}

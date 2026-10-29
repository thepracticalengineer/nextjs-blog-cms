import 'server-only'
import { pageDocumentImagesAllowed } from './document-server'
import { pageSnapshotSchema, type PageSnapshot } from './schema'

/** Public HTML, metadata and discovery must agree on which snapshots are usable. */
export function readPublishedSnapshot(value: unknown): PageSnapshot | null {
  const result = pageSnapshotSchema.safeParse(value)
  return result.success && pageDocumentImagesAllowed(result.data.document) ? result.data : null
}

import { z } from 'zod'
import { pageDocumentSchema, pageRecordSchema, pageWriteSchema, type Page, type PageValues } from '../schema'

// Incomplete titles/URLs must survive recovery even when Save Draft is invalid.
export const editableValues = z.object({ title: z.string(), slug: z.string(), seo_title: z.string(), seo_description: z.string(), document: pageDocumentSchema })
export const recoverySchema = z.object({ version: z.literal(1), accountId: z.uuid(), documentId: z.uuid(), writerId: z.uuid(), values: editableValues, page: pageRecordSchema.nullable(), pending: pageWriteSchema.nullable(), reconcile: z.boolean().default(false), updatedAt: z.number() })
export type PageRecovery = z.infer<typeof recoverySchema>
export const recoveryPrefix = (accountId: string) => `page-recovery:v1:${accountId}:`
export const recoveryKey = (record: PageRecovery) => `${recoveryPrefix(record.accountId)}${record.documentId}:${record.writerId}`
export function readPageRecovery(accountId: string, documentId?: string): PageRecovery[] {
  const records: PageRecovery[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(recoveryPrefix(accountId))) continue
    try {
      const record = recoverySchema.parse(JSON.parse(localStorage.getItem(key) ?? 'null'))
      if (record.accountId === accountId && key === recoveryKey(record) && (!documentId || record.documentId === documentId)) records.push(record)
    } catch { /* Do not load malformed or differently scoped recovery data. */ }
  }
  return records.sort((a, b) => b.updatedAt - a.updatedAt)
}
export function pageValues(page: Page): PageValues {
  const { title, slug, seo_title, seo_description, document } = page
  return { title, slug, seo_title, seo_description, document }
}
export const blankPage: PageValues = { title: '', slug: '', seo_title: '', seo_description: '', document: { version: 1, blocks: [] } }

/** Called only by editor events, before dispatch or replacing input. */
export function storePageRecovery(record: Omit<PageRecovery, 'version' | 'updatedAt' | 'reconcile'> & { reconcile?: boolean }): void {
  const complete: PageRecovery = { ...record, reconcile: record.reconcile ?? false, version: 1, updatedAt: Date.now() }
  localStorage.setItem(recoveryKey(complete), JSON.stringify(complete))
}

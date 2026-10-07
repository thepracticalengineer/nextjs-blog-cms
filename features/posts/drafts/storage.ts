import { z } from 'zod'
import { draftValuesSchema } from './schema'

export const recoverySchema = z.object({
  version: z.literal(1), userId: z.string(), documentId: z.string(), postId: z.string().nullable(),
  writerId: z.string(), values: draftValuesSchema, baseUpdatedAt: z.string().nullable(), savedAt: z.number(),
})
export type Recovery = z.infer<typeof recoverySchema>
export const recoveryPrefix = (userId: string) => `post-recovery:v1:${userId}:`
export const recoveryKey = (record: Pick<Recovery, 'userId' | 'documentId' | 'writerId'>) => `${recoveryPrefix(record.userId)}${record.documentId}:${record.writerId}`
export function readRecovery(userId: string): { key: string; record: Recovery }[] {
  const records: { key: string; record: Recovery }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(recoveryPrefix(userId))) continue
    try {
      const parsed = recoverySchema.safeParse(JSON.parse(localStorage.getItem(key) ?? 'null'))
      if (parsed.success && parsed.data.userId === userId && key === recoveryKey(parsed.data)) records.push({ key, record: parsed.data })
    } catch { /* Ignore malformed entries without touching another document. */ }
  }
  return records.sort((a, b) => b.record.savedAt - a.record.savedAt)
}

import { z } from 'zod'

export const reactionTypes = ['love', 'unicorn', 'mind_blown', 'celebrate', 'fire'] as const
export type ArticleReaction = typeof reactionTypes[number]
export const reactions = [
  { type: 'love', emoji: '💖', label: 'Love' },
  { type: 'unicorn', emoji: '🦄', label: 'Unicorn' },
  { type: 'mind_blown', emoji: '🤯', label: 'Mind blown' },
  { type: 'celebrate', emoji: '🙌', label: 'Celebrate' },
  { type: 'fire', emoji: '🔥', label: 'Fire' },
] as const
export const reactionSchema = z.enum(reactionTypes)
const count = z.number().int().nonnegative()
export const snapshotSchema = z.object({
  counts: z.object({ love: count, unicorn: count, mind_blown: count, celebrate: count, fire: count }),
  selections: z.array(reactionSchema),
})
export type ArticleReactionSnapshot = z.infer<typeof snapshotSchema>
export type ArticleReactionResult = { data: ArticleReactionSnapshot; error?: never } | { error: string; retryable?: boolean; data?: never }
export type ArticleReactionReadResult = { data: ArticleReactionSnapshot | null; viewerId: string | null; error?: never } | { error: string; data?: never; viewerId?: never }

import { z } from 'zod'

export const reactionTypes = ['like', 'love', 'celebrate', 'insightful'] as const
export type Reaction = typeof reactionTypes[number]
export const reactions = [
  { type: 'like', emoji: '👍', label: 'Like' },
  { type: 'love', emoji: '❤️', label: 'Love' },
  { type: 'celebrate', emoji: '🎉', label: 'Celebrate' },
  { type: 'insightful', emoji: '💡', label: 'Insightful' },
] as const
export const reactionSchema = z.enum(reactionTypes).nullable()
export const snapshotSchema = z.object({
  counts: z.object({ like: z.number().int().nonnegative(), love: z.number().int().nonnegative(),
    celebrate: z.number().int().nonnegative(), insightful: z.number().int().nonnegative() }),
  selection: reactionSchema,
})
export type ReactionSnapshot = z.infer<typeof snapshotSchema>
export type ReactionSnapshots = Record<string, ReactionSnapshot>
export const emptySnapshot: ReactionSnapshot = {
  counts: { like: 0, love: 0, celebrate: 0, insightful: 0 }, selection: null,
}
export type ReactionResult = { data: ReactionSnapshot; error?: never } | { error: string; data?: never; retryable?: boolean }
export type ReactionReadResult = { data: ReactionSnapshots; viewerId: string | null; error?: never } | { error: string; data?: never; viewerId?: never }

'use client'

import { createContext, useContext } from 'react'
import type { Reaction, ReactionResult, ReactionSnapshots } from '../reactions'

type ContextValue = {
  data: ReactionSnapshots
  viewerId: string | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  save: (id: string, desired: Reaction | null) => Promise<ReactionResult>
}
export const ReactionContext = createContext<ContextValue | null>(null)
export const useCommentReactions = () => useContext(ReactionContext)

'use client'

import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/supabase/types'

export type AuthContextType = {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  profileError: string | null
  refreshProfile: () => void
}

export const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  profileError: null,
  refreshProfile: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

'use client'

import { useAuth } from '../context/AuthContext'

export function useProfile() {
  const { profile, loading, profileError, refreshProfile } = useAuth()
  return { profile, loading, error: profileError, refreshProfile }
}

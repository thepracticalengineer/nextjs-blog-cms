'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'
import { AuthContext } from './AuthContext'

const REQUEST_TIMEOUT_MS = 10_000
const SESSION_ERROR = 'Unable to load your session. Try refreshing your profile.'
const PROFILE_ERROR = 'Unable to load your profile. Try again.'

type AuthState = {
  session: Session | null
  identity: number
  initialized: boolean
  error: string | null
}
type ProfileState = {
  identity: number
  revision: number
  data: Profile | null
  error: string | null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(createClient)
  const [auth, setAuth] = useState<AuthState>({ session: null, identity: 0, initialized: false, error: null })
  const [result, setResult] = useState<ProfileState | null>(null)
  const [revision, setRevision] = useState(0)
  const [sessionRetry, setSessionRetry] = useState(0)
  const identity = useRef({ id: null as string | null, version: 0 })
  const profileRequest = useRef<AbortController | null>(null)
  const userId = auth.session?.user.id ?? null

  useEffect(() => {
    let active = true
    let receivedEvent = false
    let settled = false
    const timer = setTimeout(failInitialization, REQUEST_TIMEOUT_MS)

    function failInitialization() {
      if (!active || settled) return
      settled = true
      clearTimeout(timer)
      setAuth(previous => ({ ...previous, initialized: true, error: SESSION_ERROR }))
    }

    function acceptSession(session: Session | null) {
      if (!active) return
      settled = true
      clearTimeout(timer)
      const id = session?.user.id ?? null
      if (id !== identity.current.id) {
        identity.current = { id, version: identity.current.version + 1 }
        // Invalidate immediately, including before React commits batched events.
        profileRequest.current?.abort()
      }
      setAuth({ session, identity: identity.current.version, initialized: true, error: null })
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      receivedEvent = true
      acceptSession(session)
    })

    async function initialize() {
      try {
        const { data, error } = await supabase.auth.getSession()
        // Auth events are newer than the initialization snapshot.
        if (!active || receivedEvent || settled) return
        if (error) failInitialization()
        else acceptSession(data.session)
      } catch {
        if (!receivedEvent) failInitialization()
      }
    }
    void initialize()

    return () => {
      active = false
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [supabase, sessionRetry])

  useEffect(() => {
    if (!userId) return
    let active = true
    const controller = new AbortController()
    profileRequest.current = controller

    function finish(data: Profile | null, error: string | null) {
      if (!active || controller.signal.aborted || identity.current.version !== auth.identity) return
      setResult({ identity: auth.identity, revision, data, error })
    }

    const timer = setTimeout(() => {
      finish(null, PROFILE_ERROR)
      controller.abort()
    }, REQUEST_TIMEOUT_MS)

    async function loadProfile() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId!)
          .abortSignal(controller.signal)
          .single()
        finish(error || !data ? null : data, error || !data ? PROFILE_ERROR : null)
      } catch {
        finish(null, PROFILE_ERROR)
      } finally {
        clearTimeout(timer)
      }
    }
    void loadProfile()

    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
      if (profileRequest.current === controller) profileRequest.current = null
    }
  }, [supabase, userId, auth.identity, revision])

  const refreshProfile = useCallback(() => {
    profileRequest.current?.abort()
    setRevision(previous => previous + 1)
    if (auth.error) {
      setAuth(previous => ({ ...previous, initialized: false, error: null }))
      setSessionRetry(previous => previous + 1)
    }
  }, [auth.error])

  // Derive visibility during render: an old account/request is never exposed
  // while waiting for the new identity's effect to run.
  const currentResult = userId && result?.identity === auth.identity && result.revision === revision ? result : null
  const profile = currentResult?.data ?? null
  const profileError = auth.error ?? currentResult?.error ?? null
  const loading = !auth.initialized || (!!userId && !currentResult)

  return (
    <AuthContext.Provider value={{ session: auth.session, user: auth.session?.user ?? null, profile, loading, profileError, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

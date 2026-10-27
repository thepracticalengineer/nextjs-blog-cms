'use client'
import type { ReactNode } from 'react'
import { useAuth } from '@/features/auth/context/AuthContext'

/** Unmount private caches and active transfers as soon as the live identity changes. */
export function MediaSessionBoundary({ editorId, children }: Readonly<{ editorId: string; children: ReactNode }>) {
  const { user, loading } = useAuth()
  if (loading) return <output>Verifying your account…</output>
  if (user?.id !== editorId) return <p role="alert">The signed-in account changed. Reload this page before opening your media library.</p>
  return children
}

'use client'

import { useRef, useState } from 'react'
import { allowEditorNavigation, commitEditorNavigation } from '@/features/posts/drafts/navigation'
import { signOut } from '@/lib/auth/signout-client'
import type { SignOutScope } from '@/lib/auth/signout'

export function useSignOut() {
  const running = useRef(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  async function handleSignOut(scope: SignOutScope = 'local') {
    if (running.current || !allowEditorNavigation()) return
    running.current = true
    setSigningOut(true)
    setSignOutError(null)
    try {
      const result = await signOut(scope)
      if (!result.localCleared) {
        setSignOutError('Browser credentials could not be cleared. Please retry signing out.')
        return
      }
      const warning = scope === 'global' ? 'global_unconfirmed' : 'local_only'
      // A fresh document discards the SDK singleton and cached private RSC/UI.
      commitEditorNavigation()
      window.location.replace(result.remoteRevoked ? '/login' : `/login?logout=${warning}`)
    } catch {
      setSignOutError('Sign out could not finish. Please retry.')
    } finally {
      running.current = false
      setSigningOut(false)
    }
  }
  return { handleSignOut, signingOut, signOutError }
}

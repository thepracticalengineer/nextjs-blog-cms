'use client'

import { createClient } from '@/lib/supabase/client'
import { authStorageKey, isAuthCredential, type SignOutResult, type SignOutScope } from '@/lib/auth/signout'

function credentialNames(key: string): string[] {
  return document.cookie.split(';').map(cookie => cookie.split('=')[0].trim()).filter(name => isAuthCredential(name, key))
}

export async function signOut(scope: SignOutScope = 'local'): Promise<SignOutResult> {
  let remoteRevoked = false
  try {
    createClient().auth.stopAutoRefresh()
    const response = await fetch(`/api/auth/signout?scope=${scope}`, {
      method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(10_000),
    })
    remoteRevoked = response.status === 204
  } catch {
    // The request may never reach our route. Browser cleanup must still run.
  }
  try {
    const key = authStorageKey(process.env.NEXT_PUBLIC_SUPABASE_URL!)
    for (const name of credentialNames(key)) {
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
    }
    return { localCleared: credentialNames(key).length === 0, remoteRevoked }
  } catch {
    return { localCleared: false, remoteRevoked }
  }
}

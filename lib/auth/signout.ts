import { isChunkLike } from '@supabase/ssr'

export type SignOutScope = 'local' | 'global'
export type SignOutResult = { localCleared: boolean; remoteRevoked: boolean }

export function authStorageKey(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
}

/** Match this project's credentials only; never delete editor recovery data. */
export function isAuthCredential(name: string, key: string): boolean {
  return isChunkLike(name, key) || isChunkLike(name, `${key}-user`) ||
    isChunkLike(name, `${key}-code-verifier`) ||
    (name.startsWith(`${key}-flow-`) && /-code-verifier(?:\.\d+)?$/.test(name)) ||
    name === 'cms-oauth-context'
}

export function signOutWarning(value: unknown): string | null {
  if (value === 'local_only') return 'You are signed out of this browser, but the server could not confirm session revocation. Other sessions may remain active.'
  if (value === 'global_unconfirmed') return 'You are signed out of this browser, but signing out all devices could not be confirmed. Other devices may still be signed in.'
  return null
}

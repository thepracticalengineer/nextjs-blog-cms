import { combineChunks, isChunkLike, stringFromBase64URL } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { authStorageKey, isAuthCredential, type SignOutScope } from '@/lib/auth/signout'

type SessionCredential = { access_token?: unknown; refresh_token?: unknown } | null

/** One deadline; renewed credentials are used only for revocation, never saved. */
async function revokeSession(session: SessionCredential, scope: SignOutScope, url: string): Promise<boolean> {
  if (typeof session?.access_token !== 'string' || !session.access_token) return false
  const signal = AbortSignal.timeout(5_000)
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const revoke = (token: string) => fetch(`${url}/auth/v1/logout?scope=${scope}`, {
    method: 'POST', headers: { apikey, Authorization: `Bearer ${token}` }, signal, cache: 'no-store',
  })
  const response = await revoke(session.access_token)
  if (![401, 403].includes(response.status) || typeof session.refresh_token !== 'string' || !session.refresh_token) return response.ok
  const refreshed = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }), signal, cache: 'no-store',
  })
  if (!refreshed.ok) return false
  const tokens = await refreshed.json()
  if (typeof tokens?.access_token !== 'string' || !tokens.access_token) return false
  return (await revoke(tokens.access_token)).ok
}

export async function POST(request: Request) {
  const scope = new URL(request.url).searchParams.get('scope') ?? 'local'
  if (scope !== 'local' && scope !== 'global') {
    return NextResponse.json({ error: 'Invalid sign-out scope.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  const cookieStore = await cookies()
  const incoming = cookieStore.getAll()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = authStorageKey(url)
  const hasSession = incoming.some(cookie => isChunkLike(cookie.name, key))
  let remoteRevoked = !hasSession && scope === 'local'
  try {
    // Cookie tokens are used only for revocation, never app authorization.
    const encoded = await combineChunks(key, name => incoming.find(cookie => cookie.name === name)?.value)
    if (encoded) {
      const session = JSON.parse(encoded.startsWith('base64-') ? stringFromBase64URL(encoded.slice(7)) : encoded)
      remoteRevoked = await revokeSession(session, scope, url)
    }
  } catch {
    // Provider, network, timeout and malformed-session failures still clear cookies.
    remoteRevoked = false
  }
  const response = remoteRevoked
    ? new NextResponse(null, { status: 204 })
    : NextResponse.json({ localCleared: true, remoteRevoked: false, code: 'SIGNOUT_REVOCATION_FAILED' }, { status: 503 })
  response.headers.set('Cache-Control', 'no-store')
  for (const { name } of incoming) {
    if (isAuthCredential(name, key)) response.cookies.set(name, '', { path: '/', sameSite: 'lax', maxAge: 0 })
  }
  return response
}

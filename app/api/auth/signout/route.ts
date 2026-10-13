import { combineChunks, isChunkLike, stringFromBase64URL } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { authStorageKey, isAuthCredential } from '@/lib/auth/signout'

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
    // Use the supplied access token only for revocation, never authorization.
    // Avoid getSession/signOut: their refresh step can fail before local cleanup.
    const encoded = await combineChunks(key, name => incoming.find(cookie => cookie.name === name)?.value)
    if (encoded) {
      const session = JSON.parse(encoded.startsWith('base64-') ? stringFromBase64URL(encoded.slice(7)) : encoded)
      if (typeof session?.access_token === 'string' && session.access_token) {
        const response = await fetch(`${url}/auth/v1/logout?scope=${scope}`, {
          method: 'POST',
          headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${session.access_token}` },
          signal: AbortSignal.timeout(5_000),
          cache: 'no-store',
        })
        remoteRevoked = response.ok
      }
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

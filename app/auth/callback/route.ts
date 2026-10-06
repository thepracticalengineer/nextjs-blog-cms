import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { clearRecoveryGrant, createRecoveryGrant } from '@/lib/auth/recovery'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const isRecovery = searchParams.get('type') === 'recovery'
  // Fixed application destinations only; never concatenate an untrusted next URL.
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin))
    response.headers.set('Cache-Control', 'private, no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }

  if (isRecovery) {
    try {
      await clearRecoveryGrant()
      if (tokenHash) {
        const supabase = await createClient()
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        if (!error && data.session) {
          await createRecoveryGrant(supabase)
          return redirect('/reset-password')
        }
      }
    } catch {
      // Never expose Auth/provider errors or recovery tokens in the URL.
    }
    return redirect('/reset-password?error=invalid_recovery')
  }

  // A recovery link with an old/default email template must not fall through to
  // the dashboard. Use the documented token-hash recovery email template.
  if (searchParams.get('next') === '/reset-password') {
    return redirect('/reset-password?error=invalid_recovery')
  }
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return redirect('/dashboard')
  }
  return redirect('/login?error=auth_callback_failed')
}

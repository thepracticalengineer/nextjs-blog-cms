import { onboardingEntry, onboardingAfterMfa } from '@/features/onboarding/validation'
import { onboardingDestination } from '@/features/onboarding/routing'
import { checkAssurance } from '@/lib/auth/assurance'
import { mfaDestination, safeReturnPath } from '@/lib/auth/navigation'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          Object.entries(headers).forEach(([name, value]) =>
            supabaseResponse.headers.set(name, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — required for @supabase/ssr
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Helper: build a redirect that carries any auth cookie updates from supabaseResponse.
  // Without this, session-refresh cookies written by getUser() would be lost on redirects.
  function redirectWithCookies(destination: string): NextResponse {
    const url = new URL(destination, request.nextUrl.origin)
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
    })
    for (const header of ['cache-control', 'expires', 'pragma']) {
      const value = supabaseResponse.headers.get(header)
      if (value) redirectResponse.headers.set(header, value)
    }
    return redirectResponse
  }

  // Action requests must fail in place when authentication expires. Redirecting
  // would unmount the editor before it can show retry and recovery controls.
  function denyPostAction(status: number, error = 'Authentication required. Your input is preserved; sign in again and retry.'): NextResponse {
    const response = NextResponse.json({ error }, { status })
    supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie.name, cookie.value, cookie))
    for (const header of ['cache-control', 'expires', 'pragma']) {
      const value = supabaseResponse.headers.get(header)
      if (value) response.headers.set(header, value)
    }
    return response
  }
  const isPostAction = request.method === 'POST' && request.headers.has('next-action') &&
    (pathname === '/dashboard/posts' || pathname.startsWith('/dashboard/posts/') || pathname === '/dashboard/onboarding')

  // ── /mfa page ──────────────────────────────────────────────────────────────
  if (pathname === '/mfa') {
    if (!user) return redirectWithCookies('/login')

    // Only leave the challenge when assurance is known and no step-up is needed.
    if (!await checkAssurance(supabase, user)) {
      const next = request.nextUrl.searchParams.get('next')
      const entry = onboardingAfterMfa(next)
      try {
        return redirectWithCookies(entry === safeReturnPath(next) ? entry : await onboardingDestination(supabase, user.id, next, user.app_metadata?.onboarding_pending === true))
      } catch {
        return redirectWithCookies(`/onboarding-unavailable?next=${encodeURIComponent(safeReturnPath(next))}`)
      }
    }

    return supabaseResponse
  }

  // ── /dashboard routes ──────────────────────────────────────────────────────
  if (pathname.startsWith('/dashboard')) {
    if (!user) return isPostAction ? denyPostAction(401) : redirectWithCookies(`/login?next=${encodeURIComponent(safeReturnPath(pathname + request.nextUrl.search))}`)

    // Enforce MFA for users who have it enrolled.
    // Fail-closed: if the AAL lookup fails, redirect to /mfa rather than
    // allowing the request through without MFA verification.
    if (await checkAssurance(supabase, user)) {
      return isPostAction ? denyPostAction(403) : redirectWithCookies(mfaDestination(pathname + request.nextUrl.search))
    }

    // An interrupted introduction resumes only after the existing MFA gate.
    if (!pathname.startsWith('/dashboard/onboarding') && user.app_metadata?.onboarding_pending === true) {
      try {
        const destination = await onboardingDestination(supabase, user.id, pathname + request.nextUrl.search)
        if (destination.startsWith('/dashboard/onboarding?')) {
          return isPostAction ? denyPostAction(403, 'Finish account setup to continue. Your input is preserved.') : redirectWithCookies(destination)
        }
      } catch {
        return isPostAction ? denyPostAction(503, 'Unable to check onboarding. Your input is preserved; please retry.') : redirectWithCookies(`/onboarding-unavailable?next=${encodeURIComponent(safeReturnPath(pathname + request.nextUrl.search))}`)
      }
    }

    // Protect /dashboard/admin — require admin role
    if (pathname.startsWith('/dashboard/admin')) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      const profile = profileData as { role: string } | null
      if (profile?.role !== 'admin') return redirectWithCookies('/dashboard')
    }
  }

  // ── Redirect logged-in users away from auth pages ─────────────────────────
  if (user && (pathname === '/login' || pathname === '/register')) {
    return redirectWithCookies(onboardingEntry(request.nextUrl.searchParams.get('next')))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/login',
    '/register',
    '/mfa',
    '/forgot-password',
    '/reset-password',
  ],
}

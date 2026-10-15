'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { mfaErrorMessage } from '@/lib/auth/mfa-errors'
import { safeReturnPath } from '@/lib/auth/navigation'
import { useSignOut } from '@/components/auth/use-signout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

type Factor = { id: string; friendly_name?: string; status: string }

export default function MfaChallenge({ next }: { next: string }) {
  const submitting = useRef(false)
  const [factors, setFactors] = useState<Factor[]>([])
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [reload, setReload] = useState(0)
  const supabase = useMemo(() => createClient(), [])
  const { handleSignOut, signingOut, signOutError } = useSignOut()

  useEffect(() => {
    let active = true
    async function init() {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors()
        if (error) throw error
        const verified = data.totp.filter(factor => factor.status === 'verified')
        if (!active) return
        setFactors(verified)
        setFactorId(verified[0]?.id ?? '')
        if (!verified.length) setError('No verified authenticator was found. Retry loading authenticators or contact your site administrator.')
      } catch (error) {
        if (active) setError(mfaErrorMessage(error, 'Unable to load authenticators. Retry loading authenticators.'))
      } finally {
        if (active) setInitializing(false)
      }
    }
    void init()
    return () => { active = false }
  }, [supabase, reload])

  function reloadFactors() {
    if (submitting.current || initializing || signingOut) return
    setInitializing(true)
    setFactors([])
    setFactorId('')
    setCode('')
    setError(null)
    setReload(value => value + 1)
  }

  async function handleVerify() {
    if (submitting.current || initializing || signingOut || !factorId || code.length !== 6) return
    submitting.current = true
    setLoading(true)
    setError(null)
    let navigating = false
    try {
      // Never retain a challenge while the user types or between attempts.
      const challenge = await supabase.auth.mfa.challenge({ factorId })
      if (challenge.error) throw challenge.error
      const result = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code })
      if (result.error) {
        if (result.error.code === 'mfa_challenge_expired') setCode('')
        throw result.error
      }
      window.location.replace(safeReturnPath(next))
      navigating = true
    } catch (error) {
      setError(mfaErrorMessage(error))
    } finally {
      // Preserve the lock while a successful AAL2 session leaves this document.
      if (!navigating) {
        submitting.current = false
        setLoading(false)
      }
    }
  }

  const busy = loading || initializing || signingOut
  return (
    <div className="p-8">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center size-12 rounded-full bg-blue-100 mb-4">
          <ShieldCheck className="size-6 text-blue-600" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Two-Factor Authentication</h2>
        <p className="text-sm text-gray-500 mt-1">Enter the 6-digit code from your authenticator app</p>
      </div>
      <form onSubmit={event => { event.preventDefault(); void handleVerify() }} className="flex flex-col gap-5" aria-busy={busy}>
        {(error || signOutError) && <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription id="mfa-error">{signOutError ?? error}</AlertDescription>
        </Alert>}
        {initializing && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" aria-hidden="true" />Loading authenticators…</p>}
        {factors.length > 1 && <div className="flex flex-col gap-1.5">
          <Label htmlFor="mfa-factor">Authenticator</Label>
          <select id="mfa-factor" value={factorId} disabled={busy} onChange={event => { setFactorId(event.target.value); setCode(''); setError(null) }} className="w-full rounded-md border p-2">
            {factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `Authenticator ${index + 1}`}</option>)}
          </select>
        </div>}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mfa-code">Verification Code</Label>
          <Input id="mfa-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000"
            className="text-center tracking-widest text-lg h-12" value={code} disabled={busy || !factorId}
            aria-describedby={error ? 'mfa-error' : undefined}
            onChange={event => setCode(event.target.value.replace(/\D/g, ''))} />
        </div>
        <Button type="submit" disabled={busy || !factorId || code.length !== 6} className="w-full h-10 bg-linear-to-r from-blue-600 to-indigo-600 text-white">
          {loading ? <><Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />Verifying…</> : 'Verify'}
        </Button>
        <Button variant="outline" disabled={busy} onClick={reloadFactors}>Retry loading authenticators</Button>
      </form>
      <div className="mt-5 flex flex-col gap-4">
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">Lost access to your authenticator?</summary>
          <p className="mt-2">Select another enrolled authenticator above if you have one. Otherwise, contact your site administrator through your usual support channel and ask them to verify your identity before resetting your MFA enrollment. Include your account email, but never share passwords or verification codes.</p>
          <p className="mt-2">A password reset does not remove two-factor authentication. You can sign out below to use a different account.</p>
        </details>
        <Button variant="ghost" disabled={loading || signingOut} onClick={() => { void handleSignOut() }}>{signingOut ? 'Signing out…' : 'Sign out'}</Button>
      </div>
    </div>
  )
}

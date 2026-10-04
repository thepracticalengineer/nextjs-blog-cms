'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function MfaChallengePage() {
  const router = useRouter()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const { data: factorData, error: factorsErr } = await supabase.auth.mfa.listFactors()
      if (factorsErr || !factorData.totp.length) {
        router.replace('/dashboard')
        return
      }

      const factor = factorData.totp.find((f) => f.status === 'verified')
      if (!factor) {
        router.replace('/dashboard')
        return
      }

      setFactorId(factor.id)

      const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (challengeErr) {
        setError(challengeErr.message)
        setInitializing(false)
        return
      }

      setChallengeId(challengeData.id)
      setInitializing(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleVerify() {
    if (!factorId || !challengeId || code.length !== 6) return
    setLoading(true)
    setError(null)

    const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId, challengeId, code })
    if (verifyErr) {
      setError('Invalid code — please try again')
      setLoading(false)
      return
    }

    window.location.replace('/dashboard')
  }

  if (initializing) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-4">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Two-Factor Authentication</h2>
        <p className="text-sm text-gray-500 mt-1">Enter the 6-digit code from your authenticator app</p>
      </div>

      <div className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="mfa-code">Verification Code</Label>
          <Input
            id="mfa-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            className="text-center tracking-widest text-lg h-12"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            autoFocus
          />
        </div>

        <Button
          onClick={handleVerify}
          disabled={loading || code.length !== 6}
          className="w-full h-10 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-0"
        >
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying…</> : 'Verify'}
        </Button>
      </div>
    </div>
  )
}

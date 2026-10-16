'use client'

import { useAuthAbuse } from './use-auth-abuse'
import { AuthAbuseControls } from './AuthAbuseControls'

import { startTransition, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { resendConfirmation } from '@/app/(auth)/confirm-email/actions'
import { CONFIRMATION_SENT } from '@/lib/auth/confirmation'
import { recoveryEmailSchema } from '@/lib/auth/password-policy'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ConfirmationResendForm() {
  const abuse = useAuthAbuse()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  const { remaining } = abuse
  const submitting = useRef(false)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || abuse.isBlocked()) return
    const parsed = recoveryEmailSchema.safeParse(new FormData(event.currentTarget).get('email'))
    if (!parsed.success) { setError('Enter a valid email address'); return }
    submitting.current = true
    setPending(true)
    setError(null)
    setSent(false)
    const data = new FormData()
    data.set('email', parsed.data)
    abuse.prepare(data)
    startTransition(async () => {
      try {
        const result = await resendConfirmation(data)
        abuse.receive(result)
        if (result.error) setError(result.error)
        else if (result.success) {
          setSent(true)
        }
      } catch {
        abuse.receive({})
        setError('Unable to connect. Check your connection and try again.')
      } finally {
        submitting.current = false
        setPending(false)
      }
    })
  }

  let submitLabel = 'Send confirmation link'
  if (remaining > 0) submitLabel = `Wait ${remaining} seconds to resend`
  if (pending) submitLabel = 'Requesting link…'

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Confirm your email</h2>
      <p className="text-sm text-gray-600 mt-2 mb-6">Request a new link if yours expired or never arrived. Confirmation links expire in one hour and work in any browser.</p>
      {error && <Alert variant="destructive" className="mb-5"><AlertDescription>{error}</AlertDescription></Alert>}
      {sent && <output className="block text-sm text-gray-700 mb-5">{CONFIRMATION_SENT}</output>}
      <form onSubmit={onSubmit} method="post" noValidate aria-busy={pending} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="confirmation-email">Email address</Label>
          <Input id="confirmation-email" name="email" type="email" autoComplete="email" required
            onChange={() => setError(null)} disabled={pending}
            className="h-10" />
        </div>
        <AuthAbuseControls action="confirmation" abuse={abuse} />
        <Button type="submit" disabled={pending || remaining > 0 || abuse.blocked} className="w-full h-10">
          {submitLabel}
        </Button>
      </form>
      <p className="text-sm text-center mt-6"><Link href="/login" className="text-blue-600 font-medium hover:underline">Back to sign in</Link></p>
    </div>
  )
}

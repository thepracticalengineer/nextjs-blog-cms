'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, Mail } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { requestPasswordReset } from '@/app/(auth)/forgot-password/actions'
import { recoveryEmailSchema } from '@/lib/auth/password-policy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

const schema = z.object({ email: recoveryEmailSchema })
export const RECOVERY_CONFIRMATION = 'If an account exists for this email, you’ll receive a password reset link.'

export function ForgotPasswordForm() {
  const submitting = useRef(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })

  async function onSubmit(values: z.infer<typeof schema>) {
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.set('email', values.email)
      const result = await requestPasswordReset(formData)
      if (result.error) setError(result.error)
      else setSuccess(true)
    } catch {
      setError('Unable to request a reset email right now. Please try again later.')
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Forgot your password?</h2>
        <p className="text-sm text-gray-500 mt-1">Enter your email to request a password reset link.</p>
      </div>
      {success ? (
        <p role="status" className="text-sm text-gray-700 leading-relaxed">{RECOVERY_CONFIRMATION}</p>
      ) : (
        <form onSubmit={event => { void handleSubmit(onSubmit)(event) }} noValidate className="space-y-5" aria-busy={loading}>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-1.5">
            <Label htmlFor="recovery-email" className="text-sm font-medium text-gray-700">Email address</Label>
            <div className="relative">
              <Mail aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input id="recovery-email" type="email" autoComplete="email" placeholder="you@example.com" className="pl-9 h-10"
                aria-invalid={!!errors.email} aria-describedby={errors.email ? 'recovery-email-error' : undefined}
                {...register('email')} />
            </div>
            {errors.email && <p id="recovery-email-error" role="alert" className="text-xs text-red-600">{errors.email.message}</p>}
          </div>
          <Button type="submit" disabled={loading} className="w-full h-10 bg-linear-to-r from-blue-600 to-indigo-600 text-white">
            {loading && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? 'Sending reset link…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <p className="text-sm text-center mt-6"><Link href="/login" className="text-blue-600 font-medium hover:text-blue-700">Back to sign in</Link></p>
    </div>
  )
}

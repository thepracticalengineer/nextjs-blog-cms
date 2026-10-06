'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { resetPassword } from '@/app/(auth)/reset-password/actions'
import { resetPasswordSchema } from '@/lib/auth/password-policy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

type Values = z.infer<typeof resetPasswordSchema>

export function ResetPasswordForm({ validRecovery }: { validRecovery: boolean }) {
  const submitting = useRef(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalidRecovery, setInvalidRecovery] = useState(!validRecovery)
  const [mfaBlocked, setMfaBlocked] = useState(false)
  const [success, setSuccess] = useState(false)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(resetPasswordSchema) })

  async function onSubmit(values: Values) {
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.set('password', values.password)
      formData.set('confirmPassword', values.confirmPassword)
      const result = await resetPassword(formData)
      if (result.error) {
        setError(result.error)
        if (result.mfaBlocked) setMfaBlocked(true)
        if (result.invalidRecovery) setInvalidRecovery(true)
      } else {
        reset()
        setSuccess(true)
      }
    } catch {
      setError('Unable to update your password. Request a new link and try again.')
      setInvalidRecovery(true)
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{success ? 'Password updated' : 'Reset your password'}</h2>
        {!success && <p className="text-sm text-gray-500 mt-1">Choose a new password for your account.</p>}
      </div>
      {success ? (
        <>
          <p role="status" className="text-sm text-gray-700">Your password has been updated. Sign in with your new password.</p>
          <p className="text-sm mt-6"><Link href="/login" className="text-blue-600 font-medium hover:text-blue-700">Back to sign in</Link></p>
        </>
      ) : invalidRecovery ? (
        <>
          <Alert variant="destructive"><AlertDescription>{error ?? 'This reset link is missing, expired, invalid, or already used. Request a new link to try again.'}</AlertDescription></Alert>
          <p className="text-sm mt-6">
            {mfaBlocked ? (
              <Link href="/login" className="text-blue-600 font-medium hover:text-blue-700">Back to sign in</Link>
            ) : (
              <Link href="/forgot-password" className="text-blue-600 font-medium hover:text-blue-700">Request a new reset link</Link>
            )}
          </p>
        </>
      ) : (
        <form onSubmit={event => { void handleSubmit(onSubmit)(event) }} noValidate className="space-y-5" aria-busy={loading}>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="text-sm font-medium text-gray-700">New password</Label>
            <Input id="new-password" type="password" autoComplete="new-password" className="h-10" aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'new-password-error password-hint' : 'password-hint'} {...register('password')} />
            <p id="password-hint" className="text-xs text-gray-500">Use at least 8 characters.</p>
            {errors.password && <p id="new-password-error" role="alert" className="text-xs text-red-600">{errors.password.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password" className="text-sm font-medium text-gray-700">Confirm new password</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" className="h-10" aria-invalid={!!errors.confirmPassword}
              aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined} {...register('confirmPassword')} />
            {errors.confirmPassword && <p id="confirm-password-error" role="alert" className="text-xs text-red-600">{errors.confirmPassword.message}</p>}
          </div>
          <Button type="submit" disabled={loading} className="w-full h-10 bg-linear-to-r from-blue-600 to-indigo-600 text-white">
            {loading && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? 'Updating password…' : 'Update password'}
          </Button>
        </form>
      )}
    </div>
  )
}

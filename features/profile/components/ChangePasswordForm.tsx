'use client'

import { useAuthAbuse } from '@/components/auth/use-auth-abuse'
import { AuthAbuseControls } from '@/components/auth/AuthAbuseControls'

import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { passwordSchema, reauthenticationNonceSchema } from '@/lib/auth/password-policy'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { updatePassword, requestPasswordReauthentication } from '@/features/profile/actions'

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
    nonce: z.union([z.literal(''), reauthenticationNonceSchema]).optional(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

export function ChangePasswordForm({ useEmailRecovery = false }: { useEmailRecovery?: boolean }) {
  const abuse = useAuthAbuse()
  const [saving, setSaving] = useState(false)
  const [reauthenticationRequired, setReauthenticationRequired] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const { register, handleSubmit, reset, setError: setFieldError, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(values: FormValues) {
    if (saving || abuse.isBlocked()) return
    if (reauthenticationRequired && !values.nonce) {
      setFieldError('nonce', { message: 'Enter the six-digit code from your email.' })
      return
    }
    setSaving(true)
    setError('')
    if (!reauthenticationRequired) setMessage('')
    try {
      const result = await updatePassword(values.currentPassword, values.newPassword, values.nonce || undefined)
      abuse.receive(result)
      if (result.reauthenticationRequired) setReauthenticationRequired(true)
      if (result.codeSent) setMessage('We sent a six-digit verification code to your account email. Enter it below to finish changing your password.')
      if (result.error) {
        setError(result.error)
        toast.error(result.error)
      } else if (result.success) {
        toast.success('Password updated')
        reset()
        setReauthenticationRequired(false)
        setMessage('Password updated')
      }
    } catch {
      setError('Unable to update your password right now. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function resendCode() {
    if (saving || abuse.isBlocked()) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await requestPasswordReauthentication()
      abuse.receive(result)
      if (result.error) setError(result.error)
      if (result.codeSent) setMessage('We sent a new six-digit verification code to your account email.')
    } catch {
      setError('Unable to send a verification code. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (useEmailRecovery) return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
        <CardDescription>Your account can sign in with Google or GitHub.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">To set or reset a password, verify your email using a password reset link. Your authenticator is also required if two-factor authentication is enabled.</p>
        <Link href="/forgot-password" className="text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Set or reset password by email</Link>
      </CardContent>
    </Card>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
        <CardDescription>Change your account password</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {message && <output className="text-sm">{message}</output>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input id="currentPassword" type="password" autoComplete="current-password" {...register('currentPassword')} />
            {errors.currentPassword && <p className="text-xs text-destructive">{errors.currentPassword.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">New Password</Label>
            <Input id="newPassword" type="password" autoComplete="new-password" {...register('newPassword')} />
            {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input id="confirmPassword" type="password" autoComplete="new-password" {...register('confirmPassword')} />
            {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
          </div>
          {reauthenticationRequired && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="passwordNonce">Email verification code</Label>
              <Input id="passwordNonce" inputMode="numeric" autoComplete="one-time-code" aria-invalid={!!errors.nonce} aria-describedby={errors.nonce ? 'passwordNonceError' : undefined} {...register('nonce')} />
              {errors.nonce && <p id="passwordNonceError" className="text-xs text-destructive">{errors.nonce.message}</p>}
              <Button type="button" variant="outline" onClick={resendCode} disabled={saving || abuse.blocked}>Resend code</Button>
            </div>
          )}
          <AuthAbuseControls action="password" abuse={abuse} />
          <Button type="submit" disabled={saving || abuse.blocked}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

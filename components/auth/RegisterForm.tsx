'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { passwordSchema } from '@/lib/auth/password-policy'
import Link from 'next/link'
import { AlertCircle, Loader2, Mail, Lock, User, CheckCircle2 } from 'lucide-react'
import { register as registerAction } from '@/app/(auth)/register/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

const registerSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type RegisterFormValues = z.infer<typeof registerSchema>

export default function RegisterForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  const { register, handleSubmit, clearErrors, formState: { errors } } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  })

  async function onSubmit(values: RegisterFormValues) {
    setError(null)
    setLoading(true)
    const formData = new FormData()
    formData.set('email', values.email)
    formData.set('password', values.password)
    formData.set('full_name', values.full_name)
    const result = await registerAction(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    } else if (result?.needsConfirmation) {
      setNeedsConfirmation(true)
      setLoading(false)
    } else if (result?.success) {
      router.push('/dashboard')
    }
  }

  if (needsConfirmation) {
    return (
      <div className="p-8 text-center animate-in fade-in duration-300">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Check your email</h2>
        <p className="text-gray-500 text-sm mb-6">
          We sent a confirmation link to your email. Click it to activate your account.
        </p>
        <Link
          href="/login"
          className="text-sm text-blue-600 font-medium hover:text-blue-700 transition-colors"
        >
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Create an account</h2>
        <p className="text-sm text-gray-500 mt-1">Start writing and managing your content</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="full_name" className="text-sm font-medium text-gray-700">Full name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              id="full_name"
              placeholder="Jane Smith"
              className="pl-9 h-10"
              {...register('full_name', { onChange: () => clearErrors('full_name') })}
            />
          </div>
          {errors.full_name && (
            <p className="flex items-center gap-1 text-xs text-red-600 animate-in fade-in duration-150">
              <AlertCircle className="size-3 shrink-0" />{errors.full_name.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              className="pl-9 h-10"
              {...register('email', { onChange: () => clearErrors('email') })}
            />
          </div>
          {errors.email && (
            <p className="flex items-center gap-1 text-xs text-red-600 animate-in fade-in duration-150">
              <AlertCircle className="size-3 shrink-0" />{errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              id="password"
              type="password"
              placeholder="Min. 8 characters"
              className="pl-9 h-10"
              {...register('password', { onChange: () => clearErrors('password') })}
            />
          </div>
          {errors.password && (
            <p className="flex items-center gap-1 text-xs text-red-600 animate-in fade-in duration-150">
              <AlertCircle className="size-3 shrink-0" />{errors.password.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">Confirm password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Repeat your password"
              className="pl-9 h-10"
              {...register('confirmPassword', { onChange: () => clearErrors('confirmPassword') })}
            />
          </div>
          {errors.confirmPassword && (
            <p className="flex items-center gap-1 text-xs text-red-600 animate-in fade-in duration-150">
              <AlertCircle className="size-3 shrink-0" />{errors.confirmPassword.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-10 mt-2 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-0 shadow-xs shadow-blue-500/20 transition-all duration-200 hover:shadow-md hover:shadow-blue-500/20 hover:-translate-y-px active:translate-y-0"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating account…
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </form>

      <p className="text-sm text-gray-500 text-center mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-600 font-medium hover:text-blue-700 transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  )
}

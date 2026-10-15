'use client'

import type { UseFormRegisterReturn } from 'react-hook-form'
import { AlertCircle, Mail } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function CredentialEmailField({ registration, disabled, error }: Readonly<{
  registration: UseFormRegisterReturn<'email'>
  disabled: boolean
  error?: string
}>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email address</Label>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <Input disabled={disabled} id="email" type="email" placeholder="you@example.com" className="pl-9 h-10" {...registration} />
      </div>
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-600 animate-in fade-in duration-150">
          <AlertCircle className="size-3 shrink-0" />{error}
        </p>
      )}
    </div>
  )
}

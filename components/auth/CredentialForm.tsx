'use client'

import type { ComponentProps, FormEventHandler } from 'react'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { OAuthButtons } from './OAuthButtons'

type CredentialFormProps = Omit<ComponentProps<'form'>, 'onSubmit' | 'onError'> & {
  error: string | null
  next: string
  busy: boolean
  onPendingChange: (pending: boolean) => void
  onError: (message: string | null) => void
  isBlocked: () => boolean
  onSubmit: FormEventHandler<HTMLFormElement>
}

/** Shared feedback, provider controls and guard before asynchronous field validation. */
export function CredentialForm({ error, next, busy, onPendingChange, onError, isBlocked, onSubmit, ...props }: CredentialFormProps) {
  return <>
    {error && <Alert variant="destructive" className="mb-5">
      <AlertCircle />
      <AlertDescription>{error}</AlertDescription>
    </Alert>}
    <OAuthButtons next={next} disabled={busy} onPendingChange={onPendingChange} onError={onError} />
    <form {...props} aria-busy={busy} onSubmit={event => {
      if (isBlocked()) {
        event.preventDefault()
        return
      }
      onSubmit(event)
    }} />
  </>
}

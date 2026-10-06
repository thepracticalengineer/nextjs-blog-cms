import type { Metadata } from 'next'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import { hasRecoveryGrant } from '@/lib/auth/recovery'

export const metadata: Metadata = { title: 'Reset Password', robots: { index: false, follow: false } }

export default async function ResetPasswordPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return <ResetPasswordForm validRecovery={!error && await hasRecoveryGrant()} />
}

import type { Metadata } from 'next'
import ConfirmationResendForm from '@/components/auth/ConfirmationResendForm'

export const metadata: Metadata = { title: 'Confirm your email' }

export default function ConfirmEmailPage() {
  return <ConfirmationResendForm />
}

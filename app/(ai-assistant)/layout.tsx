import { requireAuth } from '@/lib/auth/session'
import { AuthProvider } from '@/features/auth/context/AuthProvider'
import { AIAssistantShell } from '@/components/ai-assistant/AIAssistantShell'
import { Toaster } from 'sonner'

export default async function AIAssistantLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAuth('/dashboard/ai-assistant')

  return (
    <AuthProvider>
      <AIAssistantShell>
        {children}
      </AIAssistantShell>
      <Toaster richColors />
    </AuthProvider>
  )
}

import type { Metadata } from 'next'
import { requirePermission } from '@/lib/auth/session'
import { AIProvidersManager } from '@/features/ai/components/AIProvidersManager'
export const metadata: Metadata = { title: 'AI Providers — Settings' }
export default async function AIProvidersPage() {
  const profile = await requirePermission('ai_providers:write')
  return <div className="p-5 md:p-8 flex flex-col gap-6 animate-page">
    <div><p className="text-sm text-muted-foreground">Settings</p><h1 className="text-2xl font-bold tracking-tight">AI Providers</h1></div>
    <AIProvidersManager key={profile.id} ownerId={profile.id} />
  </div>
}

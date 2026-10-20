import Link from 'next/link'
import { requireAuth } from '@/lib/auth/session'
import { can, type Role } from '@/lib/permissions'

export async function RetiredWorkspace() {
  const profile = await requireAuth()
  return <div className="p-8 flex flex-col gap-4 max-w-2xl">
    <h1 className="text-2xl font-bold">This workspace has been retired</h1>
    <p>The AI Assistant and Developer API are retired. Your existing articles and drafts are preserved.</p>
    <Link className="underline" href="/dashboard/posts">Open your articles</Link>
    {can(profile.role as Role, 'ai_providers:write') && <Link className="underline" href="/dashboard/settings/ai-providers">Settings → AI Providers</Link>}
  </div>
}

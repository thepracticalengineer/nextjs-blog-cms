import type { Metadata } from 'next'
import { requirePermission } from '@/lib/auth/session'
import { MediaDashboard } from '@/features/posts/media/components/MediaDashboard'

export const metadata: Metadata = { title: 'Media library' }
export default async function MediaPage() {
  const profile = await requirePermission('posts:create')
  return <MediaDashboard key={profile.id} editorId={profile.id} />
}

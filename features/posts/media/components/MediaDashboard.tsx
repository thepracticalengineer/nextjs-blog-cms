'use client'
import { useState } from 'react'
import { MediaSessionBoundary } from './MediaSessionBoundary'
import { MediaLibrary } from './MediaLibrary'
import { MediaUploads } from './MediaUploads'

export function MediaDashboard({ editorId }: Readonly<{ editorId: string }>) {
  const [revision, setRevision] = useState(0)
  return <MediaSessionBoundary editorId={editorId}><div className="flex flex-col gap-6 p-4 md:p-8">
    <header><h1 className="text-2xl font-bold tracking-tight">Media library</h1><p className="mt-1 text-sm text-muted-foreground">Your images, ready for the next article. Only you can browse and manage this library.</p></header>
    <MediaUploads editorId={editorId} onUploaded={() => setRevision(value => value + 1)} />
    <MediaLibrary editorId={editorId} refresh={revision} />
  </div></MediaSessionBoundary>
}

'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { bulkPostAction } from '@/features/posts/bulk-actions'
import type { DashboardPostSummary } from '@/features/posts/types'

export function BulkActions({ posts, onClear, onComplete, onPending }: {
  posts: DashboardPostSummary[]
  onClear: () => void
  onComplete: (failedIds: string[], message: string) => void
  onPending: (pending: boolean) => void
}) {
  const router = useRouter()
  const [action, setAction] = useState<'delete' | 'unpublish' | null>(null)
  const [pending, setPending] = useState(false)
  const lock = useRef(false)
  const published = posts.filter(post => post.status === 'published').length
  const count = action === 'unpublish' ? published : posts.length
  const label = `${action === 'delete' ? 'Delete' : 'Unpublish'} ${count} post${count === 1 ? '' : 's'}`

  async function submit() {
    if (lock.current || !action) return
    lock.current = true
    setPending(true)
    onPending(true)
    try {
      const result = await bulkPostAction(action, posts.map(post => ({ id: post.id, updatedAt: post.updated_at })))
      if (result.error || !result.results) {
        toast.error(result.error ?? 'No results received. Refresh before retrying.')
        onComplete(posts.map(post => post.id), result.error ?? 'No results received. Refresh before retrying.')
        return
      }
      const successes = result.results.filter(item => item.status === 'success')
      const failed = result.results.filter(item => item.status === 'failed')
      const skipped = result.results.filter(item => item.status === 'skipped')
      const details = result.results.flatMap(item => item.warning ? [item.warning] : item.message && item.status === 'failed' ? [item.message] : [])
      const message = `${action === 'delete' ? 'Delete' : 'Unpublish'}: ${successes.length} successful, ${skipped.length} skipped, ${failed.length} failed.${details.length ? ` ${[...new Set(details)].join(' ')}` : ''}`
      onComplete(failed.map(item => item.id), message)
      if (failed.length) toast.error(message)
      else if (details.length) toast.warning(message)
      else toast.success(message)
      // Also refresh on failures so stale versions can be reviewed before retry.
      router.refresh()
    } catch {
      const message = 'Results could not be confirmed. Refresh and review the posts before retrying.'
      onComplete(posts.map(post => post.id), message)
      toast.error(message)
      router.refresh()
    } finally {
      lock.current = false
      setPending(false)
      onPending(false)
      setAction(null)
    }
  }

  return <>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3" aria-label="Bulk post actions">
      <span className="mr-auto text-sm font-medium">{posts.length} selected</span>
      <Button variant="outline" disabled={pending} onClick={onClear}>Clear selection</Button>
      <Button variant="outline" disabled={pending || !published} onClick={() => setAction('unpublish')} aria-label="Unpublish selected">Unpublish</Button>
      <Button variant="destructive" disabled={pending || !posts.length} onClick={() => setAction('delete')} aria-label="Delete selected">Delete</Button>
    </div>
    <Dialog open={action !== null} onOpenChange={open => { if (!open && !lock.current) setAction(null) }}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{label}?</DialogTitle>
          <DialogDescription>
            {action === 'delete'
              ? 'This permanently deletes the selected posts and their associated working copies, comments and newsletter records. This cannot be undone.'
              : `The ${published} published post${published === 1 ? '' : 's'} will become drafts and disappear from public pages. Content and working copies are preserved. ${posts.length - published} already-unpublished posts will be skipped.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setAction(null)}>Cancel</Button>
          <Button variant={action === 'delete' ? 'destructive' : 'default'} disabled={pending} onClick={submit}>{pending ? 'Processing posts…' : label}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}

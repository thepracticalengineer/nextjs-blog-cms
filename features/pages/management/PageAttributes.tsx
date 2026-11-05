'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { listPageTree } from '@/features/pages/actions'
import { parentOptions, siblingsOf, type TreeNode } from '../hierarchy'
import type { Page } from '../schema'

/**
 * Parent and order for one page. Loads the page tree only while open. Moving
 * never changes the page URL; the manager owns request identity and retries.
 */
export function PageAttributes({ page, disabled, onMove }: Readonly<{ page: Page; disabled: boolean; onMove: (parentId: string | null, position: number) => void }>) {
  const [open, setOpen] = useState(false)
  const [nodes, setNodes] = useState<TreeNode[] | null>(null)
  const [parentId, setParentId] = useState<string | null>(page.parent_id ?? null)
  const [position, setPosition] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const request = useRef(0)

  useEffect(() => {
    if (!open) return
    const ticket = ++request.current
    const load = window.setTimeout(() => {
      listPageTree().then(result => {
        if (ticket !== request.current) return
        if (result.error) { setMessage(result.error.message); return }
        setNodes(result.data); setParentId(page.parent_id ?? null); setPosition(null); setMessage('')
      }).catch(() => { if (ticket === request.current) setMessage('Pages could not be loaded. Try again.') })
    }, 0)
    return () => window.clearTimeout(load)
  }, [open, page.revision, page.parent_id])

  const options = nodes ? parentOptions(nodes, page.id) : []
  const siblings = nodes ? siblingsOf(nodes, parentId, page.id) : []
  const currentIndex = siblingsOf(nodes ?? [], page.parent_id ?? null, page.id).filter(node => node.position < (page.position ?? 0)).length
  const target = position ?? (parentId === (page.parent_id ?? null) ? currentIndex : siblings.length)
  const unchanged = parentId === (page.parent_id ?? null) && target === currentIndex
  const parentTitle = (id: string | null) => id ? options.find(row => row.id === id)?.title ?? nodes?.find(node => node.id === id)?.title ?? 'Unknown page' : 'No parent (top level)'

  return <details className="rounded-lg border p-4" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">Page attributes</summary>
    <div className="mt-3 flex min-w-0 flex-col gap-3">
      <p className="text-sm text-muted-foreground">Parent and order organize pages in the dashboard. URLs stay flat: moving a page never changes its URL. Pages nest at most three levels deep.</p>
      {message && <p role="alert">{message}</p>}
      {!nodes && !message && <output>Loading pages…</output>}
      {nodes && <>
        <p className="text-sm">Current parent: {parentTitle(page.parent_id ?? null)}</p>
        <label className="flex min-w-0 flex-col gap-1">Parent page
          <select className="h-9 min-w-0 rounded-md border bg-background px-3" value={parentId ?? ''} disabled={disabled} onChange={event => { setParentId(event.target.value || null); setPosition(null) }}>
            <option value="">No parent (top level)</option>
            {options.map(row => <option key={row.id} value={row.id}>{'— '.repeat(row.depth - 1)}{row.title} (/{row.slug})</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">Order
          <select className="h-9 min-w-0 rounded-md border bg-background px-3" value={target} disabled={disabled} onChange={event => setPosition(Number(event.target.value))}>
            <option value={0}>First</option>
            {siblings.map((sibling, index) => <option key={sibling.id} value={index + 1}>After {sibling.title}</option>)}
          </select>
        </label>
        <div><Button variant="outline" disabled={disabled || unchanged} onClick={() => onMove(parentId, target)}>Move page</Button></div>
        {disabled && <p className="text-sm text-muted-foreground">Save your changes or wait for the current request before moving.</p>}
      </>}
    </div>
  </details>
}

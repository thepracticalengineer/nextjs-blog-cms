'use client'

import { useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { Tag } from '@/lib/supabase/types'

export function TagSelector({ tags, selectedIds, onToggle, error, canManage = false }: {
  tags: Tag[]; selectedIds: string[]; onToggle: (id: string) => void; error?: boolean; canManage?: boolean
}) {
  const [search, setSearch] = useState('')
  const id = useId()
  const active = tags.filter(tag => !tag.merged_into)
  const selected = new Set(selectedIds.map(id => tags.find(tag => tag.id === id)?.merged_into ?? id))
  const chosen = active.filter(tag => selected.has(tag.id))
  const matches = active.filter(tag => !selected.has(tag.id) && tag.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  return <div className="flex min-w-0 flex-col gap-3">
    {error ? <p role="alert" className="text-sm text-destructive">Tags could not be loaded. Keep writing and retry when your draft is saved.</p> : <>
      <div aria-label="Selected tags" className="flex max-h-32 flex-col gap-1 overflow-y-auto">
        {chosen.map(tag => <Button key={tag.id} type="button" variant="secondary" size="sm" aria-pressed={true} aria-label={`Remove tag ${tag.name}`} onClick={() => onToggle(tag.id)} className="h-auto min-h-9 justify-between whitespace-normal text-left">
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{tag.name}</span><span aria-hidden="true">×</span>
        </Button>)}
      </div>
      <p role="status" className="text-xs text-muted-foreground">{chosen.length} tag{chosen.length === 1 ? '' : 's'} selected</p>
      <Label htmlFor={id}>Search tags</Label>
      <Input id={id} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name…" />
      <div aria-label="Available tags" className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {matches.map(tag => <Button key={tag.id} type="button" variant="outline" size="sm" aria-pressed={selected.has(tag.id)} onClick={() => onToggle(tag.id)} className="h-auto min-h-9 justify-start whitespace-normal text-left">
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{tag.name}</span>
        </Button>)}
      </div>
      {!active.length ? <p className="text-xs text-muted-foreground">No tags created yet.</p> : !matches.length ? <p className="text-xs text-muted-foreground">{search ? 'No matching unselected tags.' : 'All tags selected.'}</p> : null}
    </>}
    {canManage ? <a href="/dashboard/admin/tags" target="_blank" rel="noopener noreferrer" className="text-sm underline">Manage tags (opens a new tab)</a> : <p className="text-xs text-muted-foreground">Ask an administrator to create or merge tags.</p>}
  </div>
}

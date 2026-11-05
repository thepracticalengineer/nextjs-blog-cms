'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PageContent } from '../PageContent'
import { starterLayouts, type StarterLayout } from '../starters'

/**
 * Offered on a new, unsaved page. Applying a layout fills editor input only;
 * Save Draft creates the page as a private draft, and publication is refused
 * until every placeholder is replaced.
 */
export function StarterLayoutPicker({ onApply }: Readonly<{ onApply: (layout: StarterLayout) => void }>) {
  const [previewing, setPreviewing] = useState<StarterLayout['id'] | null>(null)
  const preview = starterLayouts.find(layout => layout.id === previewing)
  return <section aria-labelledby="starter-layouts-heading" className="flex min-w-0 flex-col gap-3 rounded-lg border p-4">
    <div className="flex flex-col gap-1">
      <h2 id="starter-layouts-heading" className="font-semibold">Start from a layout</h2>
      <p className="text-sm text-muted-foreground">Layouts add example structure with placeholder copy. The page stays a private draft, and it cannot be published until every [[Replace: …]] placeholder and #replace-link destination is replaced. The Contact layout lists contact details only; it has no form.</p>
    </div>
    <ul className="grid gap-2 md:grid-cols-3">{starterLayouts.map(layout => <li key={layout.id} className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
      <span className="font-medium">{layout.name}</span>
      <span className="text-sm text-muted-foreground">{layout.description}</span>
      <div className="mt-auto flex flex-wrap gap-1">
        <Button size="sm" variant="outline" aria-label={`Use the ${layout.name} layout`} onClick={() => onApply(layout)}>Use layout</Button>
        <Button size="sm" variant="ghost" aria-pressed={previewing === layout.id} aria-label={`Preview the ${layout.name} layout`} onClick={() => setPreviewing(value => value === layout.id ? null : layout.id)}>Preview</Button>
      </div>
    </li>)}</ul>
    {preview && <div className="max-h-[32rem] min-w-0 overflow-auto rounded-md border p-3" aria-label={`${preview.name} layout preview`}><PageContent document={preview.document} /></div>}
  </section>
}

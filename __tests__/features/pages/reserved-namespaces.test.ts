// @vitest-environment node
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { reservedPageSlugs } from '@/features/pages/urls'

// Route groups do not contribute URL segments. Stop at the first literal
// segment: reserving that namespace protects all routes nested beneath it.
function rootRouteSegments(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (!entry.isDirectory()) return []
    if (entry.name.startsWith('(') && entry.name.endsWith(')')) return rootRouteSegments(join(directory, entry.name))
    if (entry.name.startsWith('[') || entry.name.startsWith('_') || entry.name.startsWith('@')) return []
    return [entry.name]
  })
}

it('reserves every claimable root application and static asset namespace', () => {
  const root = process.cwd()
  const namespaces = new Set([
    ...rootRouteSegments(join(root, 'app')),
    ...readdirSync(join(root, 'public')),
  ].filter(name => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)))
  expect(namespaces.size).toBeGreaterThan(0)
  const unreserved = [...namespaces].filter(name => !reservedPageSlugs.has(name)).sort()
  expect(unreserved, 'Reserve new root namespaces in urls.ts and an ordered database migration before deploying them').toEqual([])
})

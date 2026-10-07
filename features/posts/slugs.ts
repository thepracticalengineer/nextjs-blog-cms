import slugify from 'slugify'
import { randomUUID } from 'node:crypto'

export const SLUG_MAX_LENGTH = 200
export const SLUG_WRITE_ATTEMPTS = 20
export const SLUG_CONFLICT = 'This URL is already in use or reserved by a previous published URL. Choose another slug.'
export const SLUG_CHANGE_CONFIRMATION = 'Confirm the published URL change to create a permanent redirect from the old URL.'

export type SlugPlan = { slug: string; automatic: boolean; error?: string }

export function planSlug(input: unknown, title: string, automatic?: boolean, existingSlug?: string): SlugPlan {
  if (input !== undefined && typeof input !== 'string') return { slug: '', automatic: false, error: 'Slug must be text.' }
  // Clearing an existing URL must never regenerate it from a changed title.
  if (!input?.trim() && existingSlug) return { slug: existingSlug, automatic: false }
  // Empty new-post input requests generation even after a manual slug edit.
  automatic = !input?.trim() || automatic === true
  const normalized = slugify(automatic ? title : input ?? '', { lower: true, strict: true })
  if (automatic) return { slug: normalized.slice(0, SLUG_MAX_LENGTH - 4).replace(/-+$/, '') || `draft-${randomUUID()}`, automatic: true }
  if (!normalized || normalized.length > SLUG_MAX_LENGTH) return { slug: normalized, automatic: false, error: 'Use a slug with 1–200 letters, numbers and hyphens.' }
  return { slug: normalized, automatic: false }
}

type WriteError = { code?: string; message: string; details?: string | null }
export function isSlugConflict(error: WriteError | null): boolean {
  return error?.code === '23505' && /slug/i.test(`${error.message} ${error.details ?? ''}`)
}

// Retry the actual constrained write, not a racy read-before-write check. Only
// automatic slugs may acquire a suffix; custom URLs must report a conflict.
export async function writeWithSlug<T>(plan: SlugPlan, write: (slug: string) => PromiseLike<{ data: T | null; error: WriteError | null }>) {
  const attempts = plan.automatic ? SLUG_WRITE_ATTEMPTS : 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    const slug = attempt === 0 ? plan.slug : `${plan.slug}-${attempt + 1}`
    const result = await write(slug)
    if (!isSlugConflict(result.error)) return { ...result, slug }
    if (attempt === attempts - 1) return { data: null, slug, error: { code: '23505', message: SLUG_CONFLICT } }
  }
  throw new Error('Unreachable slug retry state')
}

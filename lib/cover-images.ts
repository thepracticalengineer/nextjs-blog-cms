import { hasRemoteMatch } from 'next/dist/shared/lib/match-remote-pattern'
import { getImageRemotePatterns } from './image-config.mjs'

export const COVER_IMAGE_ERROR = 'Use a cover image from a configured HTTPS image host or remove it before previewing or publishing.'

export function isCoverImageAllowed(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string') return false
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return true
  try { return hasRemoteMatch([], getImageRemotePatterns(), new URL(value)) } catch { return false }
}

'use server'

import { isCoverImageAllowed, COVER_IMAGE_ERROR } from '@/lib/cover-images'
import { sanitizeEditorHtml } from '@/lib/editor-html'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/session'
import { can, type Role } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { renderEditorHtml } from '@/components/editor/EditorContent'

// Preview accepts current input, never persists it, and has no public URL.
export async function previewPost(content: string, editorId?: string, postId?: string, coverImage?: string) {
  const profile = await getProfile()
  if (!profile || !can(profile.role as Role, 'posts:create')) return { error: 'Unauthorized' }
  if (editorId && editorId !== profile.id) return { error: 'The signed-in account changed. Sign in with the account that opened this editor.' }
  if (!z.string().max(500_000).safeParse(content).success) return { error: 'This preview is too large.' }
  if (postId) {
    const db = await createClient()
    const { data: post } = await db.from('posts').select('author_id').eq('id', postId).single()
    if (!post || (profile.role !== 'admin' && post.author_id !== profile.id)) return { error: 'Unauthorized' }
  }
  if (!isCoverImageAllowed(coverImage)) return { error: COVER_IMAGE_ERROR }
  // Use the public TipTap renderer; also sanitize legacy HTML before inserting
  // unsaved input into the authenticated dashboard DOM.
  return { content: sanitizeEditorHtml(renderEditorHtml(content)) }
}

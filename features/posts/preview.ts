'use server'

import { isCoverImageAllowed, COVER_IMAGE_ERROR } from '@/lib/cover-images'
import sanitizeHtml from 'sanitize-html'
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
  return { content: sanitizeHtml(renderEditorHtml(content), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'input', 's', 'u', 'mark'],
    allowedAttributes: { '*': ['class', 'style'], a: ['href', 'rel'], img: ['src', 'alt'], input: ['type', 'disabled', 'checked'] },
    allowedStyles: { '*': {
      color: [/^#[a-f\d]{3,8}$/i, /^rgba?\([\d\s.,]+\)$/],
      background: [/^#[a-f\d]{3,8}$/i],
      'background-color': [/^#[a-f\d]{3,8}$/i, /^rgba?\([\d\s.,]+\)$/],
      padding: [/^[\d.]+(?:px|rem)(?: [\d.]+(?:px|rem))?$/, /^0$/],
      margin: [/^[\d.]+(?:px|rem)(?: (?:0|[\d.]+(?:px|rem)))*$/],
      'border-radius': [/^[\d.]+(?:px|rem)$/],
      'font-size': [/^[\d.]+(?:px|rem|em)$/],
      'font-family': [/^monospace$/],
      'overflow-x': [/^auto$/],
      'line-height': [/^[\d.]+$/],
      'text-align': [/^(?:left|center|right|justify)$/],
    } },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }), input: sanitizeHtml.simpleTransform('input', { type: 'checkbox', disabled: 'disabled' }) },
  }) }
}

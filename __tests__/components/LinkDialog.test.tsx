import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { LinkDialog } from '@/components/editor/LinkDialog'
import { isSafePageHref } from '@/features/pages/document'

let editor: Editor
const description = 'Use an http://, https://, mailto:, /path or #anchor link.'
function open(linkPolicy?: { validate: (value: string) => boolean; description: string }) {
  editor = new Editor({ extensions: [StarterKit], content: '<p>Link text</p>' })
  editor.commands.setTextSelection({ from: 1, to: 5 })
  const onClose = vi.fn()
  render(<LinkDialog editor={editor} triggerRef={createRef<HTMLButtonElement>()} onClose={onClose} linkPolicy={linkPolicy} />)
  return onClose
}
function apply(value: string) {
  fireEvent.change(screen.getByLabelText('URL'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
}
afterEach(() => editor?.destroy())
it.each(['/about', '#anchor'])('accepts %s with the page link policy', value => {
  const close = open({ validate: isSafePageHref, description })
  expect(screen.getByText(description, { exact: false })).toBeVisible()
  apply(value)
  expect(editor.getAttributes('link').href).toBe(value)
  expect(close).toHaveBeenCalledOnce()
})
it.each(['/about', '#anchor'])('preserves default post rejection of %s', value => {
  const close = open()
  apply(value)
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid http://, https://, or mailto: URL.')
  expect(editor.getAttributes('link')).not.toHaveProperty('href')
  expect(close).not.toHaveBeenCalled()
})
it.each(['https://example.com/about', 'http://example.com', 'mailto:author@example.com'])('preserves default acceptance of %s', value => {
  const close = open()
  apply(value)
  expect(editor.getAttributes('link').href).toBe(value)
  expect(close).toHaveBeenCalledOnce()
})
it('uses the custom policy description for invalid link feedback', () => {
  const close = open({ validate: isSafePageHref, description })
  apply('javascript:alert(1)')
  expect(screen.getByRole('alert')).toHaveTextContent(description)
  expect(close).not.toHaveBeenCalled()
})
it('rejects embedded whitespace even if a custom policy accepts it', () => {
  const close = open({ validate: () => true, description })
  apply('/unsafe path')
  expect(screen.getByRole('alert')).toHaveTextContent(description)
  expect(close).not.toHaveBeenCalled()
})

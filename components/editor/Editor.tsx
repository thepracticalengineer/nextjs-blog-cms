'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent as TipTapContent } from '@tiptap/react'
import { extensions } from './extensions'
import { Toolbar } from './Toolbar'

interface EditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

/** Returns parsed TipTap JSON object when value is JSON, otherwise returns the
 *  raw string so TipTap can treat it as HTML. */
export function parseEditorContent(value: string): object | string {
  try {
    return JSON.parse(value) as object
  } catch {
    return value
  }
}

export function Editor({ value, onChange, className }: EditorProps) {
  const isInternalUpdate = useRef(false)
  const lastEmittedValue = useRef<string | null>(null)

  const handleUpdate = useCallback(
    ({ editor }: { editor: { getJSON: () => object } }) => {
      if (isInternalUpdate.current) return
      // Keep form values current before Save/Publish can be clicked.
      const serialized = JSON.stringify(editor.getJSON())
      lastEmittedValue.current = serialized
      onChange(serialized)
    },
    [onChange]
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: value ? parseEditorContent(value) : '',
    onUpdate: handleUpdate,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose-base max-w-none focus:outline-hidden min-h-[300px] p-4',
      },
    },
  })

  // Sync external value changes (e.g. form reset or switching posts)
  useEffect(() => {
    if (!editor || value === lastEmittedValue.current) return
    lastEmittedValue.current = null
    const parsed = value ? parseEditorContent(value) : ''
    if (typeof parsed === 'object') {
      // JSON content: skip if editor already contains the same data
      if (JSON.stringify(parsed) === JSON.stringify(editor.getJSON())) return
    }
    isInternalUpdate.current = true
    editor.commands.setContent(parsed, { emitUpdate: false })
    isInternalUpdate.current = false
  }, [editor, value])

  if (!editor) return null

  return (
    <div className={`border rounded-md overflow-hidden ${className ?? ''}`}>
      <Toolbar editor={editor} />
      <TipTapContent editor={editor} />
      <div className="px-4 py-1.5 border-t text-xs text-muted-foreground text-right select-none">
        {editor.storage.characterCount?.words() ?? 0} words
        {' · '}
        {editor.storage.characterCount?.characters() ?? 0} characters
      </div>
    </div>
  )
}

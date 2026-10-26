import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorContent, useEditor } from '@tiptap/react'
import { extensions } from '@/components/editor/extensions'
import { Toolbar } from '@/components/editor/Toolbar'
import '@/app/globals.css'
function Fixture() {
  const editor = useEditor({ extensions, content: '<p>Selected text and <a href="https://old.example/">existing link</a></p>' })
  useEffect(() => {
    if (!editor) return
    const change = () => editor.commands.setContent('<p>Externally replaced content</p>')
    window.addEventListener('replace-content', change)
    return () => window.removeEventListener('replace-content', change)
  }, [editor])
  if (!editor) return null
  return <main><Toolbar editor={editor} onImage={() => {}} /><EditorContent editor={editor} />
    <button onClick={() => editor.chain().focus().setTextSelection({ from: 1, to: 14 }).run()}>Select text</button>
    <button onClick={() => editor.chain().focus().setTextSelection(21).run()}>Select existing link</button>
    <button onClick={() => editor.chain().focus().setTextSelection(15).run()}>Select caret</button>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)

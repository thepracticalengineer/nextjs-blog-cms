'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'

export function HeaderSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else if (restoreFocus.current) triggerRef.current?.focus()
    restoreFocus.current = false
  }, [open])

  const expand = () => setOpen(true)

  const collapse = (restore = true) => {
    restoreFocus.current = restore
    setOpen(false)
    setQuery('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) { collapse(); return }
    router.push(`/blog?q=${encodeURIComponent(q)}`)
    collapse(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') collapse()
  }

  return (
    <div className="flex min-w-0 flex-1 items-center justify-end sm:flex-none">
      {open ? (
        <form onSubmit={handleSubmit} role="search" className="flex min-w-0 items-center gap-1">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search articles…"
            aria-label="Search articles"
            className="h-8 min-w-0 w-full sm:w-44 border-b border-foreground/30 bg-transparent px-1 text-sm outline-hidden placeholder:text-muted-foreground focus:border-foreground transition-colors"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => collapse()}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close search"
          >
            <X className="size-4" />
          </button>
        </form>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={expand}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Search"
        >
          <Search className="size-4" />
        </button>
      )}
    </div>
  )
}

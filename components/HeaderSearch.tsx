'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'

export function HeaderSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const expand = () => {
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const collapse = () => {
    setOpen(false)
    setQuery('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) { collapse(); return }
    router.push(`/blog?q=${encodeURIComponent(q)}`)
    collapse()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') collapse()
  }

  return (
    <div className="flex items-center">
      {open ? (
        <form onSubmit={handleSubmit} className="flex items-center gap-1">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search articles…"
            aria-label="Search articles"
            className="h-8 w-44 border-b border-foreground/30 bg-transparent px-1 text-sm outline-hidden placeholder:text-muted-foreground focus:border-foreground transition-colors"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={collapse}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close search"
          >
            <X className="size-4" />
          </button>
        </form>
      ) : (
        <button
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

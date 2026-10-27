'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, FileText } from 'lucide-react'
import { can, type Role } from '@/lib/permissions'
import { cn } from '@/lib/utils'

export function PostsNavigation({ pathname, role }: { readonly pathname: string; readonly role: Role }) {
  const submenuId = useId()
  const children = [
    { href: '/dashboard/posts', label: 'All Posts', show: can(role, 'posts:create'), active: pathname === '/dashboard/posts' || (pathname.startsWith('/dashboard/posts/') && pathname !== '/dashboard/posts/new') },
    { href: '/dashboard/posts/new', label: 'Add Post', show: can(role, 'posts:create'), active: pathname === '/dashboard/posts/new' },
    { href: '/dashboard/admin/categories', label: 'Categories', show: can(role, 'categories:write'), active: pathname === '/dashboard/admin/categories' },
    { href: '/dashboard/admin/tags', label: 'Tags', show: can(role, 'tags:write'), active: pathname === '/dashboard/admin/tags' },
  ].filter(item => item.show)
  const active = children.some(item => item.active)
  const [previousPathname, setPreviousPathname] = useState(pathname)
  const [expanded, setExpanded] = useState(active)

  // Keep manual collapse until navigation; direct entry/refresh starts expanded.
  if (pathname !== previousPathname) {
    setPreviousPathname(pathname)
    if (active) setExpanded(true)
  }

  if (!children.length) return null

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={submenuId}
        onClick={() => setExpanded(value => !value)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400',
          active ? 'bg-blue-600 text-white shadow-xs shadow-blue-600/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'
        )}
      >
        <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
        Posts
        <ChevronDown aria-hidden="true" className={cn('ml-auto h-4 w-4 transition-transform', !expanded && '-rotate-90')} />
      </button>
      <ul id={submenuId} hidden={!expanded} className="ml-5 mt-1 space-y-0.5 border-l border-slate-700 pl-3">
        {children.map(item => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'block rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400',
                item.active ? 'bg-slate-800 font-semibold text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

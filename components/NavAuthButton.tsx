'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { LayoutDashboard, LogOut, Loader2 } from 'lucide-react'

const COLORS = [
  '#f59e0b', '#10b981', '#6366f1', '#ec4899',
  '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
]

function nameToColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i)) % COLORS.length
  }
  return COLORS[hash]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts.at(-1)![0]).toUpperCase()
}

function sessionToUser(session: Session | null) {
  if (!session) return null
  const email = session.user.email ?? ''
  const name =
    session.user.user_metadata?.full_name ??
    session.user.user_metadata?.name ??
    email.split('@')[0]
  return { email, name }
}

type UserState = { email: string; name: string } | null | undefined

export function NavAuthButton() {
  const [user, setUser] = useState<UserState>(undefined)
  const [signingOut, setSigningOut] = useState(false)
  const [goingToDashboard, startDashboard] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(sessionToUser(session))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(sessionToUser(session))
    })

    return () => subscription.unsubscribe()
  }, [])

  if (user === undefined) return <div className="w-8 h-8" />

  if (user === null) {
    return (
      <div className="flex items-center gap-4">
        <Link
          href="/login"
          className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          Login
        </Link>
        <Link
          href="/register"
          className="inline-flex items-center justify-center bg-foreground text-background h-8 px-4 text-xs font-semibold uppercase tracking-wider hover:opacity-80 transition-opacity"
        >
          Create Account
        </Link>
      </div>
    )
  }

  const handleDashboard = () => {
    startDashboard(() => {
      router.push('/dashboard')
    })
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
    setSigningOut(false)
  }

  const initials = getInitials(user.name)
  const color = nameToColor(user.name)
  const busy = signingOut || goingToDashboard

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full focus:outline-hidden focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 transition-opacity disabled:opacity-50"
        aria-label="Account menu"
        disabled={busy}
      >
        <div
          style={{
            width: 32,
            height: 32,
            background: color,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            userSelect: 'none',
            letterSpacing: '0.05em',
            flexShrink: 0,
            opacity: busy ? 0.5 : 1,
            transition: 'opacity 150ms',
          }}
          aria-hidden="true"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" style={{ color: '#fff' }} /> : initials}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate max-w-52 font-normal">
            {user.email}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="cursor-pointer gap-2"
            onClick={handleDashboard}
            disabled={busy}
          >
            {goingToDashboard ? <Loader2 className="size-4 animate-spin" /> : <LayoutDashboard />}
            Dashboard
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            className="cursor-pointer gap-2"
            onClick={handleSignOut}
            disabled={busy}
          >
            {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut />}
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { FileText, Users, Eye, TrendingUp, PenLine, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { getProfile } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const profile = await getProfile()
  const isAdmin = profile?.role === 'admin'

  const supabase = await createClient()

  const [{ count: totalPosts }, { count: publishedPosts }] = await Promise.all([
    isAdmin
      ? supabase.from('posts').select('*', { count: 'exact', head: true })
      : supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', profile?.id),
    isAdmin
      ? supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'published')
      : supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'published').eq('author_id', profile?.id),
  ])

  const { count: totalUsers } = isAdmin
    ? await supabase.from('profiles').select('*', { count: 'exact', head: true })
    : { count: null }

  const draftCount = (totalPosts ?? 0) - (publishedPosts ?? 0)
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  const stats = [
    {
      title: 'Total Posts',
      value: totalPosts ?? 0,
      icon: FileText,
      gradient: 'from-blue-500 to-blue-600',
      bg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      trend: `${draftCount} draft${draftCount !== 1 ? 's' : ''}`,
      show: true,
    },
    {
      title: 'Published',
      value: publishedPosts ?? 0,
      icon: Eye,
      gradient: 'from-emerald-500 to-emerald-600',
      bg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      trend: 'Live & visible',
      show: true,
    },
    {
      title: 'Total Users',
      value: totalUsers ?? 0,
      icon: Users,
      gradient: 'from-violet-500 to-violet-600',
      bg: 'bg-violet-50',
      iconColor: 'text-violet-600',
      trend: 'Active members',
      show: isAdmin,
    },
  ]

  return (
    <div className="p-4 md:p-8 space-y-8 animate-page">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Good to see you back</p>
          <h1 className="text-3xl font-bold tracking-tight mt-0.5">Hello, {firstName} 👋</h1>
        </div>
        <Link
          href="/dashboard/posts/new"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium shadow-xs shadow-blue-500/20 hover:shadow-md hover:shadow-blue-500/25 hover:-translate-y-px transition-all duration-200"
        >
          <PenLine className="h-4 w-4" />
          New Post
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.filter((s) => s.show).map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.title}
              className="relative bg-white rounded-2xl p-6 border border-gray-100 shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 overflow-hidden"
            >
              <div className={`absolute top-0 inset-x-0 h-0.5 bg-linear-to-r ${stat.gradient}`} />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="text-4xl font-bold tracking-tight mt-2 mb-3">{stat.value}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    {stat.trend}
                  </div>
                </div>
                <div className={`flex items-center justify-center w-12 h-12 rounded-2xl ${stat.bg}`}>
                  <Icon className={`h-6 w-6 ${stat.iconColor}`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Quick actions */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Quick Actions</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: '/dashboard/posts/new', label: 'Write a new post', desc: 'Start from scratch', icon: PenLine, color: 'text-blue-600 bg-blue-50' },
            { href: '/dashboard/posts', label: 'Manage posts', desc: 'Edit, publish, delete', icon: FileText, color: 'text-emerald-600 bg-emerald-50' },
            ...(isAdmin ? [{ href: '/dashboard/admin/users', label: 'Manage users', desc: 'Roles & permissions', icon: Users, color: 'text-violet-600 bg-violet-50' }] : []),
          ].map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 shadow-xs hover:shadow-md hover:border-gray-200 transition-all duration-200 hover:-translate-y-0.5"
              >
                <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${action.color} shrink-0`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.desc}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

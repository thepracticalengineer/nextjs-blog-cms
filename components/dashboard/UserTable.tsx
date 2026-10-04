'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Loader2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updateUserRole } from '@/features/users/actions'
import type { Profile } from '@/features/users/types'

interface UserTableProps {
  users: Profile[]
  currentUserId: string
}

export function UserTable({ users, currentUserId }: UserTableProps) {
  const [updating, setUpdating] = useState<string | null>(null)

  async function handleRoleChange(userId: string, currentRole: string) {
    const newRole = currentRole === 'admin' ? 'author' : 'admin'
    if (!confirm(`Change role to ${newRole}? User must log out and back in for the change to take effect.`)) return
    setUpdating(userId)
    const result = await updateUserRole(userId, newRole as 'admin' | 'author')
    result.error ? toast.error(result.error) : toast.success(`Role updated to ${newRole}`)
    setUpdating(null)
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100 shadow-xs text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-50 mb-4">
          <Users className="h-8 w-8 text-gray-300" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">No users yet</h3>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/70">
            <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">User</th>
            <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Email</th>
            <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
            <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Joined</th>
            <th className="text-right px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {users.map((user) => {
            const name = user.full_name ?? 'Unnamed'
            const initials = user.full_name
              ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
              : user.email[0]?.toUpperCase() ?? '?'
            const isAdmin = user.role === 'admin'
            const isCurrent = user.id === currentUserId

            return (
              <tr key={user.id} className="group hover:bg-blue-50/30 transition-colors duration-150">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold shrink-0 ${isAdmin ? 'bg-linear-to-br from-violet-500 to-indigo-600' : 'bg-linear-to-br from-blue-400 to-blue-600'}`}>
                      {initials}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{name}</p>
                      {isCurrent && (
                        <span className="text-[10px] text-blue-600 font-medium">You</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 hidden md:table-cell text-muted-foreground">{user.email}</td>
                <td className="px-5 py-4">
                  {isAdmin ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                      Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      Author
                    </span>
                  )}
                </td>
                <td className="px-5 py-4 hidden lg:table-cell text-sm text-muted-foreground">
                  {user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '—'}
                </td>
                <td className="px-5 py-4 text-right">
                  {!isCurrent && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={updating === user.id}
                      onClick={() => handleRoleChange(user.id, user.role)}
                      className="text-xs h-8"
                    >
                      {updating === user.id ? (
                        <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Updating…</>
                      ) : (
                        isAdmin ? 'Make Author' : 'Make Admin'
                      )}
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

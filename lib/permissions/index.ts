import type { Role, Permission } from './types'

const rolePermissions: Record<Role, Permission[]> = {
  admin: [
    'pages:create',
    'pages:read',
    'pages:update',
    'pages:publish',
    'posts:create',
    'posts:read:own',
    'posts:read:all',
    'posts:update:own',
    'posts:update:all',
    'posts:delete:own',
    'posts:delete:all',
    'posts:publish',
    'users:read',
    'users:update',
    'categories:write',
    'tags:write',
    'comments:delete:own',
    'comments:delete:all',
    'ai_providers:write',
  ],
  author: [
    'posts:create',
    'posts:read:own',
    'posts:update:own',
    'posts:delete:own',
    'posts:publish',
    'comments:delete:own',
    'ai_providers:write',
  ],
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return rolePermissions[role]?.includes(permission) ?? false
}

export function canAccess(role: Role | null | undefined, permissions: Permission[]): boolean {
  if (!role) return false
  return permissions.every((p) => can(role, p))
}

export function canAny(role: Role | null | undefined, permissions: Permission[]): boolean {
  if (!role) return false
  return permissions.some((p) => can(role, p))
}

export type { Role, Permission }

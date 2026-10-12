import { NextResponse } from 'next/server'
import { authorizeSession } from '@/lib/auth/session'
import type { Permission } from '@/lib/permissions'
import type { Profile } from '@/lib/supabase/types'

/** Run before parsing input, querying private data, or creating service clients. */
export async function authorizeApi(permission?: Permission): Promise<
  { profile: Profile; response: null } | { profile: null; response: NextResponse }
> {
  const { profile, failure } = await authorizeSession(permission)
  if (failure) return { profile: null, response: NextResponse.json(
    { error: failure.error, code: failure.code },
    { status: failure.status, headers: { 'Cache-Control': 'no-store' } },
  ) }
  return { profile, response: null }
}

/** Ownership never becomes an admin bypass for private AI documents or chats. */
export function ownsResource(profile: Pick<Profile, 'id'>, ownerId: string | null | undefined): boolean {
  return ownerId === profile.id
}

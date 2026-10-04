import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/session'
import { can } from '@/lib/permissions'
import type { Role } from '@/lib/permissions'
import { revokeApiKey, deleteApiKey } from '@/features/api-keys/apiKeyService'

export async function PATCH(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const user = await getProfile()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(user.role as Role, 'api_keys:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!params.id) return NextResponse.json({ error: 'Key ID is required' }, { status: 400 })

  try {
    await revokeApiKey(params.id, user.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API] Failed to revoke key:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const user = await getProfile()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(user.role as Role, 'api_keys:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!params.id) return NextResponse.json({ error: 'Key ID is required' }, { status: 400 })

  try {
    await deleteApiKey(params.id, user.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API] Failed to delete key:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Failed to delete key' }, { status: 500 })
  }
}

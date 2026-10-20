'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSession } from '@/features/auth/hooks/useSession'
import { PROVIDERS, type ProviderKeyRecord, type LLMProvider } from '../types'

const endpoint = '/api/settings/ai-providers'
export function AIProvidersManager({ ownerId }: { ownerId: string }) {
  const { user, loading: sessionLoading } = useSession()
  const [keys, setKeys] = useState<ProviderKeyRecord[]>([])
  const [inputs, setInputs] = useState<Partial<Record<LLMProvider, string>>>({})
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [removing, setRemoving] = useState<LLMProvider | null>(null)
  const pending = useRef(false)
  const mounted = useRef(false)
  const activeOwner = !sessionLoading && user?.id === ownerId
  const active = useRef(activeOwner)
  useEffect(() => { active.current = activeOwner }, [activeOwner])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    if (!activeOwner) return
    const controller = new AbortController()
    let current = true
    void (async () => {
      try {
        const response = await fetch(endpoint, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]), cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Providers could not be loaded.')
        if (current) { setKeys(data.keys); setLoaded(true) }
      } catch (cause) {
        if (current) setError(cause instanceof Error ? cause.message : 'Providers could not be loaded.')
      } finally { if (current) setLoading(false) }
    })()
    return () => { current = false; controller.abort() }
  }, [activeOwner, revision])

  async function mutate(provider: LLMProvider, action: 'save' | 'verify' | 'delete') {
    if (pending.current || !activeOwner) return
    pending.current = true; setBusy(true); setError(null); setNotice('')
    try {
      const response = await fetch(endpoint, {
        method: action === 'delete' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, owner_id: ownerId, ...(action === 'save' ? { api_key: inputs[provider] ?? '' } : action === 'verify' ? { action: 'verify' } : {}) }),
        signal: AbortSignal.timeout(20_000),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Provider settings could not be updated.')
      if (!mounted.current || !active.current) return
      setKeys(previous => [...previous.filter(key => key.provider !== provider), ...(action === 'delete' ? [] : [data as ProviderKeyRecord])])
      setInputs(previous => ({ ...previous, [provider]: '' })); setRemoving(null)
      setNotice(action === 'save' ? 'Key saved. Verify it when you are ready.' : action === 'delete' ? 'Key removed.' : data.is_valid ? 'Key verified. Model access depends on your provider account.' : 'Provider rejected this key. Check its permissions or replace it.')
    } catch (cause) {
      if (mounted.current && active.current) setError(cause instanceof Error ? cause.message : 'Provider settings could not be updated.')
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  if (sessionLoading) return <p role="status">Checking your session…</p>
  if (!activeOwner) return <p role="alert">Your signed-in account changed. Reload Settings before managing provider keys.</p>
  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <p className="text-sm text-muted-foreground">Configure only the providers you choose to use. Keys belong to your account. Editor assistance is planned separately; saving a key does not generate or publish articles.</p>
      {error && <div role="alert" className="text-sm text-destructive">{error}</div>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {loading ? <p role="status">Loading providers…</p> : !loaded ? <Button onClick={() => { setLoading(true); setError(null); setRevision(value => value + 1) }}>Retry loading providers</Button> : PROVIDERS.map(({ id, label }) => {
        const key = keys.find(record => record.provider === id)
        return (
          <Card key={id} className="p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{label}</h2>
              <Badge variant={key?.is_valid === false ? 'destructive' : 'secondary'}>{!key ? 'Not configured' : key.is_valid === null ? 'Saved, unverified' : key.is_valid ? 'Verified' : 'Invalid'}</Badge>
            </div>
            {key && <p className="text-sm text-muted-foreground">{key.key_preview} · Your provider account</p>}
            <form className="flex flex-col gap-2" onSubmit={event => { event.preventDefault(); void mutate(id, 'save') }}>
              <Label htmlFor={`provider-${id}`}>{label} API key</Label>
              <Input id={`provider-${id}`} type="password" autoComplete="off" spellCheck={false} value={inputs[id] ?? ''} minLength={8} maxLength={4096} required disabled={busy}
                onChange={event => setInputs(previous => ({ ...previous, [id]: event.target.value }))} />
              <Button className="self-start" type="submit" disabled={busy || !(inputs[id] ?? '').trim()} aria-label={`Save ${label} key`}>{key ? 'Replace key' : 'Save key'}</Button>
            </form>
            {key && <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => void mutate(id, 'verify')} aria-label={`Verify ${label} key`}>Verify key</Button>
              <Button variant="ghost" disabled={busy} onClick={() => setRemoving(id)} aria-label={`Remove ${label} key`}>Remove key</Button>
            </div>}
            {removing === id && <div className="flex flex-col gap-2 text-sm">
              <p>Remove your {label} key? You can add it again later.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" disabled={busy} onClick={() => void mutate(id, 'delete')} aria-label={`Confirm remove ${label} key`}>Confirm removal</Button>
                <Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>Cancel</Button>
              </div>
            </div>}
          </Card>
        )
      })}
    </div>
  )
}

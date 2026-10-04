'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Bot, Check, X, Pencil, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { LLMProvider, LLMProviderKeyRecord } from '@/features/ai-assistant/types'

type ProviderConfig = {
  provider: LLMProvider
  label: string
  color: string
  models: string
  note?: string
}

const PROVIDERS: ProviderConfig[] = [
  {
    provider: 'claude',
    label: 'Anthropic (Claude)',
    color: 'text-purple-600',
    models: 'Claude Sonnet, Claude Haiku',
  },
  {
    provider: 'gemini',
    label: 'Google (Gemini)',
    color: 'text-blue-600',
    models: 'Gemini 3.5 Flash-Lite, Gemini 3.8 Flash',
    note: 'Gemini Flash has a free tier',
  },
  {
    provider: 'openai',
    label: 'OpenAI',
    color: 'text-green-600',
    models: 'GPT-4o, GPT-4o Mini',
  },
]

export function LLMProvidersManager() {
  const [keys, setKeys] = useState<LLMProviderKeyRecord[]>([])
  const [editing, setEditing] = useState<LLMProvider | null>(null)
  const [inputValues, setInputValues] = useState<Partial<Record<LLMProvider, string>>>({})
  const [saving, setSaving] = useState<LLMProvider | null>(null)
  const [deleting, setDeleting] = useState<LLMProvider | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/developer/llm-keys')
      .then((r) => r.json())
      .then(({ keys: k }) => setKeys(k ?? []))
      .catch(() => toast.error('Failed to load LLM keys'))
      .finally(() => setLoading(false))
  }, [])

  function getKey(provider: LLMProvider) {
    return keys.find((k) => k.provider === provider) ?? null
  }

  async function handleSave(provider: LLMProvider) {
    if (!(inputValues[provider] ?? '').trim()) return
    setSaving(provider)
    try {
      const res = await fetch('/api/developer/llm-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: (inputValues[provider] ?? '').trim() }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to save key'); return }
      setKeys((prev) => {
        const existing = prev.find((k) => k.provider === provider)
        const next = prev.filter((k) => k.provider !== provider)
        return [...next, { provider, key_preview: data.key_preview, is_valid: data.is_valid, last_verified_at: new Date().toISOString(), chats_this_month: existing?.chats_this_month ?? 0 }]
      })
      toast.success(data.is_valid ? 'Key saved and verified' : 'Key saved (verification failed — check the key)')
      setEditing(null)
      setInputValues((prev) => ({ ...prev, [provider]: '' }))
    } catch {
      toast.error('Failed to save key')
    } finally {
      setSaving(null)
    }
  }

  async function handleDelete(provider: LLMProvider) {
    setDeleting(provider)
    try {
      const res = await fetch('/api/developer/llm-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      if (!res.ok) { toast.error('Failed to remove key'); return }
      setKeys((prev) => prev.filter((k) => k.provider !== provider))
      toast.success('Key removed')
    } catch {
      toast.error('Failed to remove key')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-50 shrink-0">
          <Bot className="h-4 w-4 text-purple-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">LLM Providers</h2>
          <p className="text-xs text-muted-foreground">API keys for the AI Assistant feature</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {PROVIDERS.map(({ provider, label, color, models, note }) => {
            const keyRecord = getKey(provider)
            const isEditing = editing === provider
            const isDeleting = deleting === provider

            return (
              <div key={provider} className="rounded-lg border border-gray-100 p-4 space-y-2">
                {/* Row 1: name + action buttons */}
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm font-medium ${color}`}>{label}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    {keyRecord ? (
                      <>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => { setEditing(provider); setInputValues((prev) => ({ ...prev, [provider]: '' })) }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(provider)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>

                {/* Row 2: models + note */}
                <p className="text-xs text-muted-foreground">Models: {models}</p>
                {note && <p className="text-xs text-muted-foreground italic">{note}</p>}

                {/* Row 3: status badge + key preview + usage */}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  {keyRecord ? (
                    <>
                      <Badge
                        variant={keyRecord.is_valid ? 'default' : keyRecord.is_valid === false ? 'destructive' : 'secondary'}
                        className="text-[10px]"
                      >
                        {keyRecord.is_valid ? (
                          <><Check className="h-2.5 w-2.5 mr-1" />Connected</>
                        ) : keyRecord.is_valid === false ? (
                          <><X className="h-2.5 w-2.5 mr-1" />Invalid</>
                        ) : (
                          'Untested'
                        )}
                      </Badge>
                      {keyRecord.key_preview && (
                        <span className="text-xs font-mono text-muted-foreground">{keyRecord.key_preview}</span>
                      )}
                      {keyRecord.is_valid && (
                        <span className="text-xs text-muted-foreground">
                          <span className="font-medium text-gray-700">{keyRecord.chats_this_month}</span> chat{keyRecord.chats_this_month !== 1 ? 's' : ''} this month
                        </span>
                      )}
                    </>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">Not configured</Badge>
                  )}
                </div>

                {(isEditing || !keyRecord) && (
                  <div className="space-y-2">
                    <Label className="text-xs">API Key</Label>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        value={inputValues[provider] ?? ''}
                        onChange={(e) => setInputValues((prev) => ({ ...prev, [provider]: e.target.value }))}
                        placeholder={`Paste your ${label} API key`}
                        className="text-xs font-mono h-8"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(provider) }}
                      />
                      <Button
                        size="sm" className="h-8 shrink-0 bg-blue-600 hover:bg-blue-700 text-white border-0"
                        onClick={() => handleSave(provider)}
                        disabled={saving === provider || !(inputValues[provider] ?? '').trim()}
                      >
                        {saving === provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                      </Button>
                      {keyRecord && (
                        <Button
                          size="sm" variant="ghost" className="h-8 shrink-0"
                          onClick={() => { setEditing(null); setInputValues((prev) => ({ ...prev, [provider]: '' })) }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

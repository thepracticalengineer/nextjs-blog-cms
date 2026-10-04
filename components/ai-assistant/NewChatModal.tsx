// components/ai-assistant/NewChatModal.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Upload, FileText, ChevronRight, Loader2, AlertTriangle, Bot, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { AVAILABLE_MODELS } from '@/features/ai-assistant/types'
import type { AIBook, LLMModel, LLMProvider, LLMProviderKeyRecord } from '@/features/ai-assistant/types'
import { format } from 'date-fns'

type UploadedBookData = {
  id: string
  title: string
  file_name: string
  page_count: number | null
  word_count: number | null
  char_count: number | null
  was_truncated: boolean
  created_at: string | null
}

type UploadStep = 'uploading' | 'extracting' | 'done'

type Props = {
  open: boolean
  onClose: () => void
  onChatCreated: (chatId: string) => void
}

function formatWordCount(count: number | null): string {
  if (!count) return ''
  if (count >= 1000) return `~${Math.round(count / 1000)}k words`
  return `~${count} words`
}

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M context`
  if (tokens >= 1000) return `${tokens / 1000}K context`
  return `${tokens} context`
}

export function NewChatModal({ open, onClose, onChatCreated }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [books, setBooks] = useState<AIBook[]>([])
  const [providerKeys, setProviderKeys] = useState<LLMProviderKeyRecord[]>([])
  const [selectedBook, setSelectedBook] = useState<AIBook | null>(null)
  const [uploadedBookData, setUploadedBookData] = useState<UploadedBookData | null>(null)
  const [selectedModel, setSelectedModel] = useState<LLMModel | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadStep, setUploadStep] = useState<UploadStep>('uploading')
  const [creating, setCreating] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [previousOpen, setPreviousOpen] = useState(open)
  if (open !== previousOpen) {
    setPreviousOpen(open)
    if (!open) {
      setStep(1)
      setSelectedBook(null)
      setSelectedModel(null)
      setUploadedBookData(null)
    }
  }

  useEffect(() => {
    if (!open) return
    Promise.all([
      fetch('/api/ai-assistant/books').then((r) => r.json()),
      fetch('/api/developer/llm-keys').then((r) => r.json()),
    ]).then(([booksData, keysData]) => {
      setBooks(booksData.books ?? [])
      const keys: LLMProviderKeyRecord[] = keysData.keys ?? []
      setProviderKeys(keys)
      const hasClaudeKey = keys.some((k) => k.provider === 'claude' && k.is_valid !== false)
      const hasOpenAIKey = keys.some((k) => k.provider === 'openai' && k.is_valid !== false)
      const hasGeminiKey = keys.some((k) => k.provider === 'gemini' && k.is_valid !== false)
      const defaultModel = hasClaudeKey
        ? AVAILABLE_MODELS.find((m) => m.id === 'claude-sonnet-4-6') ?? null
        : hasOpenAIKey
          ? AVAILABLE_MODELS.find((m) => m.id === 'gpt-4o') ?? null
          : hasGeminiKey
            ? AVAILABLE_MODELS.find((m) => m.provider === 'gemini') ?? null
            : null
      setSelectedModel(defaultModel)
    }).catch(() => toast.error('Failed to load data — please try again'))
  }, [open])

  function isProviderEnabled(provider: LLMProvider) {
    return providerKeys.some((k) => k.provider === provider && k.is_valid !== false)
  }

  function getDisabledReason(model: LLMModel): string | null {
    if (!isProviderEnabled(model.provider)) {
      const label = model.provider === 'claude'
        ? 'Anthropic'
        : model.provider === 'openai'
          ? 'OpenAI'
          : 'Google'
      return `Add your ${label} API key in Developer Settings to use ${model.name}`
    }
    return null
  }

  function isLargeBook(model: LLMModel): boolean {
    if (!uploadedBookData?.char_count) return false
    return model.provider === 'openai' && uploadedBookData.char_count > 400000
  }

  async function handleFileSelect(file: File) {
    if (file.type !== 'application/pdf') { toast.error('Please upload a PDF file'); return }
    if (file.size > 30 * 1024 * 1024) { toast.error('File too large — max 30MB'); return }

    setUploading(true)
    setUploadStep('uploading')

    try {
      const fd = new FormData()
      fd.append('file', file)

      // Simulate upload → extracting progress
      setTimeout(() => setUploadStep('extracting'), 400)

      const res = await fetch('/api/ai-assistant/books', { method: 'POST', body: fd })

      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? 'Upload failed')
        return
      }

      const { data } = await res.json()
      setUploadStep('done')
      setUploadedBookData(data)

      // Add the newly created book to the list as an AIBook
      const newBook: AIBook = {
        id: data.id,
        user_id: '',
        title: data.title,
        file_name: data.file_name,
        page_count: data.page_count,
        extracted_text: '',
        word_count: data.word_count,
        char_count: data.char_count,
        created_at: data.created_at,
        updated_at: null,
      }
      setBooks((prev) => [newBook, ...prev])
      setSelectedBook(newBook)

      setTimeout(() => setStep(2), 800)
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleStartChat() {
    if (!selectedBook || !selectedModel) return
    setCreating(true)
    try {
      const res = await fetch('/api/ai-assistant/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_id: selectedBook.id,
          llm_provider: selectedModel.provider,
          llm_model: selectedModel.id,
        }),
      })
      if (!res.ok) { toast.error('Failed to create chat'); return }
      const { chat } = await res.json()
      onChatCreated(chat.id)
    } catch {
      toast.error('Failed to create chat')
    } finally {
      setCreating(false)
    }
  }

  const noKeysConfigured = !providerKeys.some((k) => k.is_valid !== false)

  const providerGroups: { provider: LLMProvider; label: string }[] = [
    { provider: 'claude', label: 'Anthropic' },
    { provider: 'openai', label: 'OpenAI' },
    { provider: 'gemini', label: 'Google' },
  ]

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle>New Chat</DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Upload a PDF — text will be extracted automatically. The file itself is not stored.'
              : 'Choose your AI model'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 overflow-y-auto max-h-[70vh]">
            {/* Drop zone */}
            <div
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                dragOver ? 'border-blue-500 bg-blue-50/10' : 'border-slate-200 hover:border-slate-300',
                uploading && 'pointer-events-none opacity-60'
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false)
                const f = e.dataTransfer.files[0]
                if (f) handleFileSelect(f)
              }}
            >
              <input
                ref={fileInputRef} type="file" accept=".pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
              />
              {uploading ? (
                <div className="space-y-3">
                  <Loader2 className="h-8 w-8 text-blue-500 mx-auto animate-spin" />
                  <div className="space-y-1.5">
                    {(['uploading', 'extracting', 'done'] as UploadStep[]).map((s) => {
                      const labels: Record<UploadStep, string> = {
                        uploading: 'Uploading PDF…',
                        extracting: 'Extracting text…',
                        done: 'Ready to chat!',
                      }
                      const isDone = uploadStep === 'done'
                        || (s === 'uploading' && uploadStep !== 'uploading')
                      const isCurrent = uploadStep === s
                      return (
                        <p
                          key={s}
                          className={cn(
                            'text-xs',
                            isDone ? 'text-green-600' : isCurrent ? 'text-blue-600 font-medium' : 'text-slate-400'
                          )}
                        >
                          {isDone ? '✅' : isCurrent ? '⏳' : '○'} {labels[s]}
                        </p>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-700">Drop a PDF here</p>
                  <p className="text-xs text-muted-foreground mt-1">or click to browse — max 30MB</p>
                </>
              )}
            </div>

            {/* Existing books */}
            {books.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Or select an existing book</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {books.map((book) => (
                    <button
                      key={book.id}
                      onClick={() => { setSelectedBook(book); setUploadedBookData(null); setStep(2) }}
                      className={cn(
                        'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border text-left text-sm transition-colors',
                        selectedBook?.id === book.id
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                      )}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{book.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {book.file_name}
                          {book.word_count ? ` · ${formatWordCount(book.word_count)}` : ''}
                          {book.created_at ? ` · ${format(new Date(book.created_at), 'MMM d, yyyy')}` : ''}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && selectedBook && (
          <div className="space-y-4 overflow-y-auto max-h-[70vh]">
            {/* Uploaded book summary card */}
            {uploadedBookData ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-sm font-medium text-green-800">Book processed</span>
                </div>
                <p className="text-xs text-green-700 pl-6">
                  📄 {uploadedBookData.file_name}
                </p>
                <p className="text-xs text-green-700 pl-6">
                  📖 {uploadedBookData.page_count ? `${uploadedBookData.page_count} pages` : ''}
                  {uploadedBookData.word_count ? `  ·  ${formatWordCount(uploadedBookData.word_count)}` : ''}
                  {uploadedBookData.char_count ? `  ·  ${uploadedBookData.char_count.toLocaleString()} characters` : ''}
                </p>
                {uploadedBookData.was_truncated && (
                  <div className="flex items-start gap-1.5 mt-1 pl-6">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      This book is very long. The first ~400,000 characters were extracted for AI context.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Selected book recap (for existing books) */
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-sm font-medium truncate">{selectedBook.title}</span>
                <button
                  onClick={() => setStep(1)}
                  className="ml-auto text-xs text-blue-600 hover:underline shrink-0"
                >
                  Change
                </button>
              </div>
            )}

            {/* No keys warning */}
            {noKeysConfigured && (
              <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 border border-amber-200 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  No LLM providers configured.{' '}
                  <a href="/dashboard/developer" className="underline font-medium">
                    Go to Developer Settings
                  </a>{' '}
                  to add your API keys.
                </p>
              </div>
            )}

            {/* Model selector */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Choose model</p>
              {providerGroups.map(({ provider, label }) => {
                const providerModels = AVAILABLE_MODELS.filter((m) => m.provider === provider)
                return (
                  <div key={provider}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
                      {label}
                    </p>
                    <div className="space-y-1">
                      {providerModels.map((model) => {
                        const disabledReason = getDisabledReason(model)
                        const isSelected = selectedModel?.id === model.id
                        const largeBookWarning = isLargeBook(model)
                        return (
                          <button
                            key={model.id}
                            title={disabledReason ?? (largeBookWarning ? 'This book is large. GPT-4o will use a truncated version of the text. Consider using Claude or Gemini for better full-book coverage.' : '')}
                            disabled={!!disabledReason}
                            onClick={() => setSelectedModel(model)}
                            className={cn(
                              'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border text-left text-sm transition-colors',
                              isSelected
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : disabledReason
                                  ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                                  : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                            )}
                          >
                            <Bot className="h-4 w-4 shrink-0 text-slate-400" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{model.name}</span>
                                {model.free && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Free</Badge>
                                )}
                                <span className="text-[10px] text-slate-400">
                                  {formatContextWindow(model.contextWindow)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">{model.description}</p>
                            </div>
                            {isSelected && <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1 h-9">
                Back
              </Button>
              <Button
                onClick={handleStartChat}
                disabled={!selectedModel || creating}
                className="flex-1 h-9 bg-blue-600 hover:bg-blue-700 text-white border-0"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Start Chat
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

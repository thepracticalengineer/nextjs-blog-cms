// app/(ai-assistant)/dashboard/ai-assistant/[chatId]/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { FileText, Sparkles, Loader2, AlertCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useParams } from 'next/navigation'
import { ChatMessages } from '@/components/ai-assistant/ChatMessages'
import { ChatInput } from '@/components/ai-assistant/ChatInput'
import { AVAILABLE_MODELS } from '@/features/ai-assistant/types'
import type { AIChat, AIMessage } from '@/features/ai-assistant/types'

type Props = Record<string, never>

export default function ChatPage(_props: Props) {
  const { chatId } = useParams<{ chatId: string }>()

  const [chat, setChat] = useState<AIChat | null>(null)
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [generateOpen, setGenerateOpen] = useState(false)
  const generationAttempt = useRef<{ snapshot: string; key: string } | null>(null)
  const generationInFlight = useRef(false)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [chatRes, messagesRes] = await Promise.all([
          fetch(`/api/ai-assistant/chats`).then((r) => r.json()),
          fetch(`/api/ai-assistant/chats/${chatId}/messages`).then((r) => r.json()),
        ])
        const foundChat = (chatRes.chats ?? []).find((c: AIChat) => c.id === chatId)
        setChat(foundChat ?? null)
        setMessages(messagesRes.messages ?? [])
      } catch {
        toast.error('Failed to load chat')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [chatId])

  async function handleSend() {
    const content = inputValue.trim()
    if (!content || isStreaming) return

    setInputValue('')
    setSendError(null)
    setIsStreaming(true)
    setStreamingContent('')

    // Optimistically add user message
    const tempUserMsg: AIMessage = {
      id: `temp-${Date.now()}`,
      chat_id: chatId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUserMsg])

    try {
      const res = await fetch(`/api/ai-assistant/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const message = res.status === 429
          ? (data.error ?? 'Rate limit exceeded. Please wait a moment and try again.')
          : (data.error ?? 'Failed to send message')
        setSendError(message)
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id))
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        full += chunk
        setStreamingContent(full)
      }

      // Reload messages to get the persisted versions with real IDs
      const msgRes = await fetch(`/api/ai-assistant/chats/${chatId}/messages`)
      const msgData = await msgRes.json()
      setMessages(msgData.messages ?? [])
    } catch {
      setSendError('Connection error. Please check your network and try again.')
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id))
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
    }
  }

  async function handleGeneratePost() {
    if (generationInFlight.current) return
    generationInFlight.current = true
    const snapshot = JSON.stringify({ chatId, messages })
    if (generationAttempt.current?.snapshot !== snapshot) {
      generationAttempt.current = { snapshot, key: crypto.randomUUID() }
    }
    setGenerating(true)
    try {
      const res = await fetch(`/api/ai-assistant/chats/${chatId}/generate-post`, {
        method: 'POST',
        headers: { 'Idempotency-Key': generationAttempt.current.key },
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Generation failed'); return }

      generationAttempt.current = null
      setGenerateOpen(false)
      toast.success(
        <span>
          Post created!{' '}
          <a
            href={`/dashboard/posts/${data.post_id}/edit`}
            className="underline font-medium"
          >
            View Draft
          </a>
        </span>
      )
    } catch {
      toast.error('Generation failed')
    } finally {
      generationInFlight.current = false
      setGenerating(false)
    }
  }

  const modelInfo = chat
    ? AVAILABLE_MODELS.find((m) => m.id === chat.llm_model)
    : null

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 text-slate-600 animate-spin" />
      </div>
    )
  }

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-sm text-slate-500">Chat not found.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950 shrink-0">
        <FileText className="h-4 w-4 text-slate-500 shrink-0" />
        <span className="text-sm font-medium text-slate-200 truncate flex-1">
          {chat.book?.title ?? 'Document'}
        </span>
        {modelInfo && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {modelInfo.name}
          </Badge>
        )}
        <Button
          size="sm"
          onClick={() => setGenerateOpen(true)}
          disabled={messages.length === 0}
          className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white border-0 shrink-0"
        >
          <Sparkles className="h-3 w-3 mr-1.5" />
          Generate Post
        </Button>
      </div>

      {/* Messages */}
      <ChatMessages
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
        onSuggestedPrompt={(prompt) => { setInputValue(prompt) }}
      />

      {/* Inline error banner */}
      {sendError && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-red-950/60 border-t border-red-900/50 text-red-300 text-xs shrink-0">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
          <span className="flex-1">{sendError}</span>
          <button aria-label="Dismiss error" onClick={() => setSendError(null)} className="text-red-500 hover:text-red-300 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Input */}
      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        disabled={isStreaming}
      />

      {/* Generate Post confirmation dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Generate Blog Post</DialogTitle>
            <DialogDescription>
              Generate a draft blog post from this conversation? The post will be saved as a draft for you to review and edit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleGeneratePost}
              disabled={generating}
              className="bg-blue-600 hover:bg-blue-700 text-white border-0"
            >
              {generating ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating…</>
              ) : (
                'Generate Post'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// components/ai-assistant/ChatMessages.tsx
'use client'

import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AIMessage } from '@/features/ai-assistant/types'

type Props = {
  messages: AIMessage[]
  streamingContent: string  // partial assistant message being streamed
  isStreaming: boolean
  onSuggestedPrompt?: (prompt: string) => void
}

const SUGGESTED_PROMPTS = [
  'Summarize the key themes of this document',
  'What are the most interesting ideas I could write about?',
  'Write an outline for a blog post based on this material',
  'What are the main arguments made by the author?',
]

export function ChatMessages({ messages, streamingContent, isStreaming, onSuggestedPrompt }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <Bot className="h-12 w-12 text-slate-700 mb-4" />
        <p className="text-sm font-medium text-slate-400 mb-1">Start the conversation</p>
        <p className="text-xs text-slate-600 mb-6">Ask anything about the uploaded document</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onSuggestedPrompt?.(prompt)}
              className="text-left px-3 py-2.5 rounded-xl border border-slate-700 text-xs text-slate-400 hover:text-white hover:border-slate-600 hover:bg-slate-800 transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
        >
          {message.role === 'assistant' && (
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-linear-to-br from-purple-500 to-indigo-600 shrink-0 mr-2.5 mt-1">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
          )}
          <div
            className={cn(
              'max-w-[75%] rounded-2xl px-4 py-3 text-sm',
              message.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-slate-800 text-slate-100 rounded-bl-sm'
            )}
          >
            {message.role === 'user' ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="prose prose-sm prose-invert max-w-none">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Streaming assistant message */}
      {isStreaming && (
        <div className="flex justify-start">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-linear-to-br from-purple-500 to-indigo-600 shrink-0 mr-2.5 mt-1">
            <Bot className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm bg-slate-800 text-slate-100 rounded-bl-sm">
            {streamingContent ? (
              // Render as plain text during streaming to avoid ReactMarkdown jitter on incomplete markdown
              <p className="whitespace-pre-wrap">{streamingContent}</p>
            ) : (
              <div className="flex items-center gap-1 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" />
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

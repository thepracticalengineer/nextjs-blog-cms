// components/ai-assistant/ChatInput.tsx
'use client'

import { useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({ value, onChange, onSend, disabled, placeholder }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!disabled && value.trim()) onSend()
    }
  }

  return (
    <div className="border-t border-slate-800 bg-slate-950 p-4">
      <div className="flex items-end gap-3 max-w-4xl mx-auto">
        <div className="flex-1 bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden focus-within:border-slate-600 transition-colors">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? 'Ask something about the document…'}
            disabled={disabled}
            rows={1}
            className={cn(
              'w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-600',
              'px-4 py-3 resize-none outline-hidden',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          />
        </div>
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-xl shrink-0 transition-colors',
            disabled || !value.trim()
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <p className="text-center text-[10px] text-slate-700 mt-2 max-w-4xl mx-auto">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  )
}

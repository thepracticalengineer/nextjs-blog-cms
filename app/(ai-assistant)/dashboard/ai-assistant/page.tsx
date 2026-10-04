// app/(ai-assistant)/dashboard/ai-assistant/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewChatModal } from '@/components/ai-assistant/NewChatModal'

export default function AIAssistantPage() {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <div className="flex-1 flex flex-col items-center justify-center h-full text-center p-8">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br from-purple-500 to-indigo-600 mb-6 shadow-lg shadow-purple-500/20">
          <Bot className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">AI Assistant</h1>
        <p className="text-sm text-slate-400 max-w-sm mb-6">
          Upload a PDF or book and chat with it to generate blog posts
        </p>
        <Button
          onClick={() => setModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white border-0"
        >
          Start New Chat
        </Button>
      </div>

      <NewChatModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onChatCreated={(chatId) => {
          setModalOpen(false)
          router.push(`/dashboard/ai-assistant/${chatId}`)
        }}
      />
    </>
  )
}

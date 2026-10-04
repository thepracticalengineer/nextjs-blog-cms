'use client'

import { useState, useEffect, useCallback, type MouseEvent } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bot, Plus, ChevronDown, ChevronRight, ArrowLeft, FileText, MessageSquare, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NewChatModal } from './NewChatModal'
import type { AIChat, AIBook } from '@/features/ai-assistant/types'

export function AISidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const [chats, setChats] = useState<AIChat[]>([])
  const [books, setBooks] = useState<AIBook[]>([])
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(() => {
    return Promise.all([
      fetch('/api/ai-assistant/chats').then((r) => r.json()),
      fetch('/api/ai-assistant/books').then((r) => r.json()),
    ]).then(([chatsRes, booksRes]) => {
      setChats(chatsRes.chats ?? [])
      setBooks(booksRes.books ?? [])
    }).catch(() => {
      // Keep the current list on a failed refresh.
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function toggleBook(bookId: string) {
    setExpandedBooks((prev) => {
      const next = new Set(prev)
      next.has(bookId) ? next.delete(bookId) : next.add(bookId)
      return next
    })
  }

  async function handleDeleteChat(chatId: string, e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this chat? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/ai-assistant/chats/${chatId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete chat'); return }
      if (currentChatId === chatId) { onClose?.(); router.push('/dashboard/ai-assistant') }
      loadData()
    } catch {
      toast.error('Failed to delete chat')
    }
  }

  async function handleDeleteBook(bookId: string, bookTitle: string, e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Delete "${bookTitle}"? All chats for this book will also be deleted. This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/ai-assistant/books/${bookId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete book'); return }
      const bookChats = chats.filter((c) => c.book_id === bookId)
      if (bookChats.some((c) => c.id === currentChatId)) { onClose?.(); router.push('/dashboard/ai-assistant') }
      loadData()
    } catch {
      toast.error('Failed to delete book')
    }
  }

  const recentChats = chats.slice(0, 10)

  const chatsByBook = books.map((book) => ({
    book,
    chats: chats.filter((c) => c.book_id === book.id),
  }))

  const currentChatId = pathname.match(/\/dashboard\/ai-assistant\/([^/]+)/)?.[1]

  return (
    <>
      <aside className="w-64 shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-linear-to-br from-purple-500 to-indigo-600">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-white text-sm">AI Assistant</span>
          </div>
          <Link
            href="/dashboard"
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-3"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Dashboard
          </Link>
          <Button
            onClick={() => { setModalOpen(true); onClose?.() }}
            className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white border-0"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Chat
          </Button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-5">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded-lg bg-slate-800/50 animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {recentChats.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-2 mb-1.5">
                    Recent
                  </p>
                  <div className="space-y-0.5">
                    {recentChats.map((chat) => (
                      <div key={chat.id} className="group relative">
                        <Link
                          href={`/dashboard/ai-assistant/${chat.id}`}
                          onClick={onClose}
                          className={cn(
                            'flex flex-col px-2 py-2 pr-7 rounded-lg text-xs transition-colors',
                            currentChatId === chat.id
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800'
                          )}
                        >
                          <span className="font-medium truncate">{chat.title}</span>
                          <span className={cn(
                            'text-[10px] truncate',
                            currentChatId === chat.id ? 'text-blue-200' : 'text-slate-600'
                          )}>
                            {chat.book?.title}{chat.last_message_at ? ` · ${formatDistanceToNow(new Date(chat.last_message_at), { addSuffix: true })}` : ''}
                          </span>
                        </Link>
                        <button
                          type="button"
                          aria-label="Delete chat"
                          onClick={(e) => handleDeleteChat(chat.id, e)}
                          className={cn(
                            'absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-sm transition-opacity',
                            'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100',
                            currentChatId === chat.id
                              ? 'text-blue-200 hover:text-white hover:bg-blue-500'
                              : 'text-slate-600 hover:text-red-400 hover:bg-slate-700'
                          )}
                          title="Delete chat"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {chatsByBook.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-2 mb-1.5">
                    By Book
                  </p>
                  <div className="space-y-1">
                    {chatsByBook.map(({ book, chats: bookChats }) => (
                      <div key={book.id}>
                        <div className="group relative">
                          <button
                            onClick={() => toggleBook(book.id)}
                            className="flex items-center gap-1.5 w-full px-2 py-1.5 pr-7 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                          >
                            {expandedBooks.has(book.id)
                              ? <ChevronDown className="h-3 w-3 shrink-0" />
                              : <ChevronRight className="h-3 w-3 shrink-0" />
                            }
                            <FileText className="h-3 w-3 shrink-0" />
                            <span className="truncate font-medium">{book.title}</span>
                            <span className="ml-auto text-[10px] text-slate-600 shrink-0 flex items-center gap-1.5">
                              {book.word_count ? `~${Math.round(book.word_count / 1000)}k words` : ''}
                              <span className="text-slate-700">{bookChats.length}</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label="Delete book and all its chats"
                            onClick={(e) => handleDeleteBook(book.id, book.title, e)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-sm transition-opacity opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 text-slate-600 hover:text-red-400 hover:bg-slate-700"
                            title="Delete book and all its chats"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        {expandedBooks.has(book.id) && (
                          <div className="ml-5 mt-0.5 space-y-0.5">
                            {bookChats.length === 0 ? (
                              <p className="text-[10px] text-slate-600 px-2 py-1">No chats yet</p>
                            ) : (
                              bookChats.map((chat) => (
                                <div key={chat.id} className="group/chat relative">
                                  <Link
                                    href={`/dashboard/ai-assistant/${chat.id}`}
                                    onClick={onClose}
                                    className={cn(
                                      'flex items-center gap-1.5 px-2 py-1.5 pr-7 rounded-lg text-[11px] transition-colors',
                                      currentChatId === chat.id
                                        ? 'bg-blue-600 text-white'
                                        : 'text-slate-500 hover:text-white hover:bg-slate-800'
                                    )}
                                  >
                                    <MessageSquare className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{chat.title}</span>
                                  </Link>
                                  <button
                                    type="button"
                                    aria-label="Delete chat"
                                    onClick={(e) => handleDeleteChat(chat.id, e)}
                                    className={cn(
                                      'absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-sm transition-opacity',
                                      'opacity-100 sm:opacity-0 sm:group-hover/chat:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100',
                                      currentChatId === chat.id
                                        ? 'text-blue-200 hover:text-white hover:bg-blue-500'
                                        : 'text-slate-600 hover:text-red-400 hover:bg-slate-700'
                                    )}
                                    title="Delete chat"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {chats.length === 0 && books.length === 0 && (
                <div className="text-center py-8">
                  <Bot className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                  <p className="text-xs text-slate-600">No chats yet.</p>
                  <p className="text-xs text-slate-600">Click New Chat to start.</p>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      <NewChatModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onChatCreated={(chatId: string) => {
          setModalOpen(false)
          loadData()
          router.push(`/dashboard/ai-assistant/${chatId}`)
        }}
      />
    </>
  )
}

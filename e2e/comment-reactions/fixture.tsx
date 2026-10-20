import React from 'react'
import { createRoot } from 'react-dom/client'
import { CommentReactions } from '@/features/comments/components/CommentReactions'
import { CommentReactionProvider } from '@/features/comments/components/CommentReactionProvider'
import '@/app/globals.css'
createRoot(document.getElementById('root')!).render(
  <main className="mx-auto max-w-xl p-4">
   <h1 className="text-xl font-semibold">Discussion</h1>
   <p className="mt-6">This example helped me understand the tradeoffs.</p>
   <CommentReactionProvider postId="15900000-0000-4000-8000-000000000010" initialData={null} initialViewerId={null} returnPath="/blog/example#comments">
    <CommentReactions commentId="15900000-0000-4000-8000-000000000020" />
   </CommentReactionProvider>
  </main>,
)

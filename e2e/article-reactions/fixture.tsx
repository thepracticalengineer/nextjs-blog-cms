import React from 'react'
import { createRoot } from 'react-dom/client'
import { ArticleReactions } from '@/features/article-reactions/ArticleReactions'
import '@/app/globals.css'
createRoot(document.getElementById('root')!).render(
 <main className="mx-auto max-w-xl p-4">
  <h1 className="text-3xl font-semibold">Small signals, lasting ideas</h1>
  <p className="mt-4 text-muted-foreground">A practical guide to making engineering decisions that last.</p>
  <ArticleReactions postId="15300000-0000-4000-8000-000000000010" initialData={null} initialViewerId={null} returnPath="/blog/example#article-reactions" />
  <a href="#after">Continue reading</a>
 </main>,
)

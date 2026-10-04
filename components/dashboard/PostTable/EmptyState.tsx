import Link from 'next/link'
import { FileText, Plus } from 'lucide-react'

export function PostEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100 shadow-xs text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-50 mb-4">
        <FileText className="h-8 w-8 text-gray-300" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">No posts yet</h3>
      <p className="text-sm text-muted-foreground mb-6">Create your first post to get started.</p>
      <Link
        href="/dashboard/posts/new"
        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
      >
        <Plus className="h-4 w-4" />
        Create Post
      </Link>
    </div>
  )
}

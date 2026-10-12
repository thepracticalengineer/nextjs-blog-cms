import Link from 'next/link'

export function PostPagination({ path, page, total, pageSize }: { path: string; page: number; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (page > pages) return <Link href={path} className="underline">Back to first page</Link>
  if (pages <= 1) return null
  const linkClass = 'inline-flex min-h-11 items-center px-5 py-2 border rounded-full text-sm font-medium hover:bg-muted transition-colors'
  return (
    <nav aria-label="Article pagination" className="flex flex-wrap items-center justify-center gap-3 pt-4">
      {page > 1 && <Link href={`${path}?page=${page - 1}`} className={linkClass}>← Previous</Link>}
      <span className="text-sm text-muted-foreground" aria-current="page">Page {page} of {pages}</span>
      {page < pages && <Link href={`${path}?page=${page + 1}`} className={linkClass}>Next →</Link>}
    </nav>
  )
}

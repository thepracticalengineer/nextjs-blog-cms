import Link from 'next/link'
import { requirePermission } from '@/lib/auth/session'
import { listPages } from '@/features/pages/management/list'
import { PageRecoveryLinks } from '@/features/pages/management/PageRecoveryLinks'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
export default async function PagesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const profile = await requirePermission('pages:read')
  const params = await searchParams
  const result = await listPages(params)
  const href = (page: number) => `/dashboard/pages?${new URLSearchParams({ q: params.q ?? '', status: params.status ?? '', page: String(page) })}`
  return <div className="flex flex-col gap-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Pages</h1><Link className={buttonVariants()} href="/dashboard/pages/new">Add Page</Link></header>
    <p className="text-muted-foreground">Informational and landing pages. Public URLs and View Page will be available with issue #289.</p>
    <PageRecoveryLinks accountId={profile.id} />
    <form className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">Search titles<Input name="q" defaultValue={params.q} maxLength={200} /></label>
      <label className="flex flex-col gap-1">Status<select className="h-9 rounded-md border bg-background px-3" name="status" defaultValue={params.status ?? ''}><option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option></select></label>
      <button type="submit" className={buttonVariants({ variant: 'outline' })}>Search</button>
    </form>
    {result.error ? <p role="alert">Pages could not be loaded. Reload to retry.</p> : <>
      <p>{result.data.count} pages</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Title', 'Planned URL', 'Status', 'Updated', 'Actions'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{result.data.pages.map(page => <tr className="border-t" key={page.id}><td className="max-w-64 break-words p-3">{page.title}</td><td className="max-w-64 break-all p-3">/{page.slug}</td><td className="p-3">{page.status}</td><td className="whitespace-nowrap p-3">{new Date(page.updated_at).toISOString().slice(0, 10)}</td><td className="p-3"><Link className="underline" href={`/dashboard/pages/${page.id}/edit`}>Edit<span className="sr-only"> {page.title}</span></Link></td></tr>)}</tbody></table></div>
      {!result.data.pages.length && <p>No matching pages. Adjust the search or add a page.</p>}
      <nav aria-label="Page list pagination" className="flex gap-4">{result.data.page > 1 && <Link href={href(result.data.page - 1)}>Previous</Link>}<Link href={href(1)}>First page</Link><span>Page {result.data.page}</span>{result.data.page * 20 < result.data.count && <Link href={href(result.data.page + 1)}>Next</Link>}</nav>
    </>}
  </div>
}

import type { PageWrite } from '@/features/pages/schema'
export async function writePage(input: PageWrite, _accountId?: string) { return (await fetch('/fixture/write', { method: 'POST', body: JSON.stringify(input) })).json() }
export async function getPage(id: string) { return (await fetch(`/fixture/read?id=${id}`)).json() }
export async function listPageRevisions(pageId: string) { return (await fetch(`/fixture/revisions?page=${pageId}`)).json() }
export async function getPageRevision(pageId: string, revision: string) { return (await fetch(`/fixture/revision?page=${pageId}&revision=${revision}`)).json() }

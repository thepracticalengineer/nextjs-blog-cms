'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { readPageRecovery, type PageRecovery } from './recovery'
export function PageRecoveryLinks({ accountId }: { accountId: string }) {
  const [records, setRecords] = useState<PageRecovery[]>([])
  useEffect(() => { const timer = window.setTimeout(() => { try { setRecords(readPageRecovery(accountId)) } catch { /* Storage unavailable; editor reports it. */ } }, 0); return () => window.clearTimeout(timer) }, [accountId])
  if (!records.length) return null
  return <section aria-label="Private page recovery"><h2 className="font-semibold">Recover work in this browser</h2><ul className="flex flex-col gap-2">{records.map(record => <li key={`${record.documentId}:${record.writerId}`}><Link className="underline" href={record.page ? `/dashboard/pages/${record.page.id}/edit?recovery=${record.documentId}` : `/dashboard/pages/new?draft=${record.documentId}`}>{record.values.title || 'Untitled page'}</Link> — {new Date(record.updatedAt).toLocaleString()}</li>)}</ul></section>
}

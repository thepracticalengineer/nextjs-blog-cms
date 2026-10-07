'use client'

import { useEffect, useRef, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { loadWorkingCopy, saveWorkingCopy, discardWorkingCopy } from './actions'
import { snapshot, draftTooLarge, DRAFT_TOO_LARGE, type DraftValues } from './schema'
import { readRecovery, recoveryKey, recoverySchema, type Recovery } from './storage'
import { installNavigationGuard } from './navigation'

type FormValues = DraftValues & { editorial_reviewed: boolean }
export type DraftIdentity = { userId: string; documentId: string }
type Candidate = { id: string; values: DraftValues; baseUpdatedAt: string | null; label: string; localKey?: string; revision?: string }
type State = { ready: boolean; status: 'idle' | 'pending' | 'saving' | 'saved' | 'failed'; error?: string; storageError?: string; candidates: Candidate[] }
type Controller = {
  retry: () => void
  restore: (id: string) => void
  discardCandidate: (id: string) => Promise<void>
  discard: () => Promise<boolean>
  beginSave: () => Promise<string | null>
  finishSave: (values?: FormValues, updatedAt?: string | null, createdPostId?: string) => Promise<void>
  updateBase: (updatedAt: string | null) => void
  canLeave: () => boolean
}

export function useDraftRecovery(form: UseFormReturn<FormValues>, identity?: DraftIdentity, postId: string | null = null, updatedAt: string | null = null) {
  const [state, setState] = useState<State>({ ready: !identity, status: 'idle', candidates: [] })
  const controller = useRef<Controller | null>(null)
  const { getValues, reset, watch } = form
  const userId = identity?.userId
  const documentId = identity?.documentId

  useEffect(() => {
    if (!userId || !documentId) return
    const writerId = crypto.randomUUID()
    const recordIdentity = { userId, documentId, writerId }
    let ownKey = recoveryKey(recordIdentity)
    let recoveryPostId = postId
    const original = snapshot(getValues())
    let latestSnapshot = original
    let safeSnapshot = original
    let baseUpdatedAt = updatedAt
    let revision: string | null = null
    let ready = false
    let paused = false
    let disposed = false
    let candidates: Candidate[] = []
    let restored: { key: string; snapshot: string } | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let localTimer: ReturnType<typeof setTimeout> | undefined
    let lastLocalWrite = 0
    let inFlight: Promise<void> | undefined
    let request: { snapshot: string; revision: string } | undefined
    const update = (patch: Partial<State>) => { if (!disposed) setState(previous => ({ ...previous, ...patch })) }
    const currentSnapshot = () => latestSnapshot
    const unsafe = () => currentSnapshot() !== safeSnapshot || candidates.some(candidate => candidate.localKey)
    function removeLocal(key: string, expectedSnapshot?: string) {
      try {
        if (expectedSnapshot !== undefined) {
          const current = recoverySchema.safeParse(JSON.parse(localStorage.getItem(key) ?? 'null'))
          if (!current.success || snapshot(current.data.values) !== expectedSnapshot) return
        }
        localStorage.removeItem(key)
      } catch { update({ storageError: 'Local recovery is unavailable. Keep this tab open until saving succeeds.' }) }
    }
    function persistLocal() {
      clearTimeout(localTimer)
      if (latestSnapshot === safeSnapshot) return true
      const values = JSON.parse(latestSnapshot) as DraftValues
      lastLocalWrite = Date.now()
      const record: Recovery = { version: 1, ...recordIdentity, postId: recoveryPostId, values, baseUpdatedAt, savedAt: Date.now() }
      try { localStorage.setItem(ownKey, JSON.stringify(record)); update({ storageError: undefined }); return true }
      catch { update({ storageError: 'Local recovery is unavailable. Keep this tab open until saving succeeds.' }); return false }
    }
    function schedule() {
      clearTimeout(timer)
      if (!ready || paused || disposed || candidates.length || inFlight || currentSnapshot() === safeSnapshot) return
      update({ status: 'pending' })
      timer = setTimeout(() => { void autosave() }, 1200)
    }
    async function autosave() {
      if (paused || disposed || inFlight || candidates.length) return
      persistLocal()
      const submitted = latestSnapshot
      const values = JSON.parse(submitted) as DraftValues
      if (submitted === safeSnapshot) return
      if (draftTooLarge(submitted)) { update({ status: 'failed', error: DRAFT_TOO_LARGE }); return }
      if (request?.snapshot !== submitted) request = { snapshot: submitted, revision: crypto.randomUUID() }
      const requestRevision = request.revision
      update({ status: 'saving', error: undefined })
      let success = false
      inFlight = (async () => {
        try {
          const result = await saveWorkingCopy({ editorId: userId!, documentId: documentId!, postId: recoveryPostId, values, expectedRevision: revision, revision: requestRevision, baseUpdatedAt })
          if (!result.data) { update({ status: 'failed', error: result.error ?? 'Autosave failed. Retry to save your writing.' }); return }
          revision = result.data.revision
          safeSnapshot = submitted
          request = undefined
          success = true
          // A response acknowledges only the submitted snapshot. It never resets
          // the editor or removes recovery for writing typed during that request.
          if (currentSnapshot() === submitted) {
            removeLocal(ownKey)
            if (restored) { removeLocal(restored.key, restored.snapshot); restored = undefined }
            update({ status: 'saved', error: undefined })
          } else persistLocal()
        } catch {
          update({ status: 'failed', error: 'Autosave failed. Check your connection or sign in again, then retry. Your input is preserved.' })
        }
      })()
      await inFlight
      inFlight = undefined
      if (success) schedule()
    }
    async function initialize() {
      update({ ready: false })
      let local: ReturnType<typeof readRecovery> = []
      try { local = readRecovery(userId!) } catch { update({ storageError: 'Local recovery is unavailable. Keep this tab open until saving succeeds.' }) }
      try {
        const result = await loadWorkingCopy(documentId!, postId, userId!)
        if (disposed) return
        revision = result.data?.revision ?? null
        candidates = local.filter(entry => entry.record.documentId === documentId && (entry.record.postId === postId || (postId === documentId && entry.record.postId === null)) && entry.key !== ownKey && snapshot(entry.record.values) !== original)
          .map(entry => ({ id: entry.key, localKey: entry.key, values: entry.record.values, baseUpdatedAt: entry.record.baseUpdatedAt, label: `On this device · ${new Date(entry.record.savedAt).toLocaleString()}` }))
        if (result.data && snapshot(result.data.values) !== original) {
          candidates.push({ id: 'server', revision: result.data.revision, values: result.data.values, baseUpdatedAt: result.data.base_updated_at, label: `Server working copy · ${new Date(result.data.updated_at).toLocaleString()}` })
        }
        ready = !result.error
        update({ ready: true, candidates, ...(result.error ? { status: 'failed', error: result.error } : { error: undefined }) })
        syncNavigation()
        schedule()
      } catch {
        update({ ready: true, status: 'failed', error: 'Draft recovery could not connect. Retry when connected. Your input is preserved.' })
      }
    }
    let syncNavigation = () => {}
    const subscription = watch(() => {
      latestSnapshot = snapshot(getValues())
      clearTimeout(localTimer)
      const remaining = 300 - (Date.now() - lastLocalWrite)
      if (remaining <= 0) persistLocal()
      else localTimer = setTimeout(persistLocal, remaining)
      syncNavigation()
      schedule()
    })
    const navigationGuard = installNavigationGuard(() => !unsafe() || window.confirm('Some writing is not saved to the server. Leave this editor? Recovery will remain on this device.'), unsafe)
    syncNavigation = navigationGuard.sync
    const beforeUnload = (event: BeforeUnloadEvent) => {
      persistLocal()
      if (unsafe()) { event.preventDefault(); event.returnValue = '' }
    }
    const pageHide = () => persistLocal()
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('pagehide', pageHide)
    const online = () => { if (!ready) void initialize(); else schedule() }
    window.addEventListener('online', online)
    controller.current = {
      retry: () => { if (!ready) void initialize(); else { clearTimeout(timer); void autosave() } },
      restore: id => {
        const candidate = candidates.find(item => item.id === id)
        if (!candidate) return
        // Replacing an already edited form is explicit; preserve its own recovery.
        if (currentSnapshot() !== original && !window.confirm('Replace the current editor contents with this recovered copy?')) return
        if (postId && candidate.baseUpdatedAt !== updatedAt && !window.confirm('The post changed after this recovery copy was written. Restore this copy over the currently loaded version? Review the recovered article before saving.')) return
        baseUpdatedAt = postId ? updatedAt : candidate.baseUpdatedAt
        restored = candidate.localKey ? { key: candidate.localKey, snapshot: snapshot(candidate.values) } : undefined
        candidates = []
        if (candidate.revision) safeSnapshot = snapshot(candidate.values)
        reset({ ...candidate.values, editorial_reviewed: false })
        update({ candidates, status: currentSnapshot() === safeSnapshot ? 'saved' : 'pending' })
        schedule()
      },
      discardCandidate: async id => {
        const candidate = candidates.find(item => item.id === id)
        if (!candidate || !window.confirm('Discard this recovered copy permanently?')) return
        if (candidate.revision) {
          try {
            const result = await discardWorkingCopy(documentId!, recoveryPostId, candidate.revision, userId!)
            if (result.error) { update({ status: 'failed', error: result.error }); return }
            revision = null
          } catch { update({ status: 'failed', error: 'Could not discard this copy. Retry when connected.' }); return }
        }
        if (candidate.localKey) removeLocal(candidate.localKey, snapshot(candidate.values))
        candidates = candidates.filter(item => item.id !== id)
        update({ candidates })
        schedule()
      },
      discard: async () => {
        if ((currentSnapshot() !== original || candidates.length) && !window.confirm('Discard your changes and leave the editor?')) return false
        paused = true
        clearTimeout(timer)
        await inFlight
        if (revision) {
          try {
            const result = await discardWorkingCopy(documentId!, recoveryPostId, revision, userId!)
            if (result.error) { paused = false; update({ status: 'failed', error: result.error }); return false }
          } catch { paused = false; update({ status: 'failed', error: 'Discard failed. Retry when connected.' }); return false }
        }
        removeLocal(ownKey)
        if (restored) removeLocal(restored.key, restored.snapshot)
        for (const candidate of candidates) if (candidate.localKey) removeLocal(candidate.localKey, snapshot(candidate.values))
        candidates = []
        safeSnapshot = currentSnapshot()
        return true
      },
      beginSave: async () => { persistLocal(); paused = true; clearTimeout(timer); await inFlight; return baseUpdatedAt },
      finishSave: async (values, newUpdatedAt, createdPostId) => {
        try {
          if (values) {
            safeSnapshot = snapshot(values)
            baseUpdatedAt = newUpdatedAt ?? null
            if (revision) {
              const result = await discardWorkingCopy(documentId!, recoveryPostId, revision, userId!)
              if (!result.error) revision = null
            }
            if (currentSnapshot() === safeSnapshot) {
              removeLocal(ownKey)
              if (restored) { removeLocal(restored.key, restored.snapshot); restored = undefined }
              update({ status: 'saved', error: undefined })
            } else {
              persistLocal()
            }
            // Keep the same editor open after creation, now saving working
            // copies against the persisted post identity.
            if (createdPostId) {
              const previousKey = ownKey
              recordIdentity.documentId = createdPostId
              recoveryPostId = createdPostId
              ownKey = recoveryKey(recordIdentity)
              if (persistLocal() && previousKey !== ownKey) removeLocal(previousKey)
            }
          }
        } catch { update({ storageError: 'Recovery cleanup failed. Your writing is still available on this device.' }) }
        finally { paused = false; schedule() }
      },
      updateBase: value => { baseUpdatedAt = value; persistLocal() },
      canLeave: () => !unsafe() || window.confirm('Some writing is not saved to the server. Leave this editor? Recovery will remain on this device.'),
    }
    void initialize()
    return () => {
      persistLocal()
      disposed = true
      clearTimeout(localTimer)
      clearTimeout(timer)
      subscription.unsubscribe()
      navigationGuard.dispose()
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('pagehide', pageHide)
      window.removeEventListener('online', online)
      controller.current = null
    }
    // An editor is keyed by user/document at the route boundary. Form methods
    // are stable; publication refreshes must not reinitialize an active editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, documentId, getValues, reset, watch])

  return {
    ...state,
    retry: () => controller.current?.retry(),
    restore: (id: string) => controller.current?.restore(id),
    discardCandidate: (id: string) => controller.current?.discardCandidate(id),
    discard: () => controller.current?.discard() ?? Promise.resolve(true),
    beginSave: () => controller.current?.beginSave() ?? Promise.resolve(updatedAt),
    finishSave: (values?: FormValues, timestamp?: string | null, createdPostId?: string) => controller.current?.finishSave(values, timestamp, createdPostId) ?? Promise.resolve(),
    updateBase: (timestamp: string | null) => controller.current?.updateBase(timestamp),
    canLeave: () => controller.current?.canLeave() ?? true,
  }
}

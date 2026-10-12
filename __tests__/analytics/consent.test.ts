import { afterEach, expect, it, vi } from 'vitest'
import { CONSENT_KEY, getConsent, setConsent, subscribeConsent } from '@/lib/analytics/consent'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear() })

it('keeps the current choice in memory when writes fail but reads still work', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  setConsent('granted')
  expect(getConsent()).toBe('granted')
  setConsent('denied')
  expect(getConsent()).toBe('denied')
})

it('notifies an idle tab when consent expires', () => {
  vi.useFakeTimers()
  setConsent('granted')
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ value: 'granted', expires: Date.now() + 100 }))
  const notify = vi.fn()
  const stop = subscribeConsent(notify)
  vi.advanceTimersByTime(100)
  expect(notify).toHaveBeenCalledOnce()
  expect(getConsent()).toBe('unknown')
  stop()
})

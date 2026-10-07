import { afterEach, describe, expect, it, vi } from 'vitest'
import { installNavigationGuard, allowEditorNavigation } from '@/features/posts/drafts/navigation'

afterEach(() => { vi.restoreAllMocks(); Object.defineProperty(window, 'navigation', { value: undefined, configurable: true }) })

describe('editor navigation protection', () => {
  it('cancels native history traversal without intercepting a new-tab link', () => {
    const navigation = new EventTarget()
    Object.defineProperty(window, 'navigation', { value: navigation, configurable: true })
    const leave = vi.fn(() => false)
    const guard = installNavigationGuard(leave, () => true)
    const event = new Event('navigate', { cancelable: true })
    Object.assign(event, { navigationType: 'traverse', canIntercept: true, destination: { url: `${location.origin}/dashboard` } })
    navigation.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(leave).toHaveBeenCalledTimes(1)
    const anchor = document.createElement('a'); anchor.href = '/dashboard'; anchor.target = '_blank'; document.body.appendChild(anchor)
    const click = new MouseEvent('click', { cancelable: true, bubbles: true, ctrlKey: true })
    anchor.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
    expect(leave).toHaveBeenCalledTimes(1)
    expect(allowEditorNavigation()).toBe(false)
    anchor.remove(); guard.dispose()
    expect(allowEditorNavigation()).toBe(true)
  })
  it('adds a fallback history sentinel only after unsafe edits and returns forward on cancelled back', () => {
    Object.defineProperty(window, 'navigation', { value: undefined, configurable: true })
    let unsafe = false
    const push = vi.spyOn(history, 'pushState').mockImplementation(() => {})
    const forward = vi.spyOn(history, 'forward').mockImplementation(() => {})
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const guard = installNavigationGuard(() => false, () => unsafe)
    guard.sync()
    expect(push).not.toHaveBeenCalled()
    unsafe = true; guard.sync(); guard.sync()
    expect(push).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    expect(forward).toHaveBeenCalledOnce()
    expect(back).not.toHaveBeenCalled()
    guard.dispose()
  })
})

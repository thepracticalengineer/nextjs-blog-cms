export function allowEditorNavigation(): boolean {
  return window.dispatchEvent(new Event('post-editor:navigate', { cancelable: true }))
}

// Next links are stopped before their click handler can start a transition.
// Navigation API also covers browser back/forward where supported. The fallback
// keeps a same-URL history entry so popstate can be cancelled before Next sees it.
export function installNavigationGuard(canLeave: () => boolean, isUnsafe: () => boolean): { dispose: () => void; sync: () => void } {
  const click = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return
    const destination = new URL(anchor.href, location.href)
    if (destination.origin !== location.origin) return
    if (destination.href === location.href || (destination.pathname === location.pathname && destination.search === location.search && destination.hash)) return
    if (!canLeave()) { event.preventDefault(); event.stopPropagation() }
  }
  document.addEventListener('click', click, true)
  const requestedNavigation = (event: Event) => { if (!canLeave()) event.preventDefault() }
  window.addEventListener('post-editor:navigate', requestedNavigation)
  type NavigateEvent = Event & { canIntercept: boolean; navigationType: string; destination: { url: string } }
  const navigation = (window as unknown as { navigation?: EventTarget }).navigation
  let cleanupHistory = () => {}
  let sync = () => {}
  if (navigation) {
    const navigate = (event: Event) => {
      const next = event as NavigateEvent
      // Link clicks already asked; only intercept history traversal here.
      if (next.navigationType === 'traverse' && next.canIntercept && next.destination.url !== location.href && !canLeave()) event.preventDefault()
    }
    navigation.addEventListener('navigate', navigate)
    cleanupHistory = () => navigation.removeEventListener('navigate', navigate)
  } else {
    const marker = crypto.randomUUID()
    const initialUrl = location.href
    let installed = false
    sync = () => {
      if (!installed && isUnsafe()) {
        history.pushState({ ...history.state, draftGuard: marker }, '', initialUrl)
        installed = true
      }
    }
    let skipping = false
    const popstate = (event: PopStateEvent) => {
      if (!installed) return
      if (skipping) { skipping = false; return }
      if (event.state?.draftGuard === marker) return
      event.stopImmediatePropagation()
      skipping = true
      if (canLeave()) history.back()
      else history.forward()
    }
    window.addEventListener('popstate', popstate, true)
    cleanupHistory = () => {
      window.removeEventListener('popstate', popstate, true)
      if (installed && history.state?.draftGuard === marker && location.href === initialUrl) history.back()
    }
  }
  return { dispose: () => { document.removeEventListener('click', click, true); window.removeEventListener('post-editor:navigate', requestedNavigation); cleanupHistory() }, sync }
}

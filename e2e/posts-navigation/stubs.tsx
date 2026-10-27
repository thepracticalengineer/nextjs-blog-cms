import React, { useSyncExternalStore } from 'react'
function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener)
  return () => window.removeEventListener('popstate', listener)
}
export function usePathname() { return useSyncExternalStore(subscribe, () => window.location.pathname) }
export function useSignOut() { return { handleSignOut() {}, signingOut: false, signOutError: null } }
export default function Element(props: React.ComponentProps<'a'> & React.ComponentProps<'img'>) {
  // eslint-disable-next-line @next/next/no-img-element -- This isolated harness has no Next image server.
  if (props.src) return <img {...props} alt={props.alt} />
  return <a {...props} href={props.href} onClick={event => {
    event.preventDefault()
    history.pushState(null, '', `${props.href}${window.location.search}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }} />
}

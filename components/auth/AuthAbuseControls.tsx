'use client'

import Script from 'next/script'
import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState } from 'react'
import type { useAuthAbuse } from './use-auth-abuse'

type Turnstile = {
  render: (container: HTMLElement, options: { sitekey: string; action: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string
  remove: (id: string) => void
}

declare global { interface Window { turnstile?: Turnstile } }

export function AuthAbuseControls({ action, abuse }: Readonly<{ action: string; abuse: ReturnType<typeof useAuthAbuse> }>) {
  const container = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const { captchaRequired, challengeVersion, remaining, setToken } = abuse
  useEffect(() => {
    if (!captchaRequired || !sitekey || !container.current || !window.turnstile) return
    const api = window.turnstile
    let active = true
    const id = api.render(container.current, {
      sitekey, action,
      callback: token => { if (active) { setFailed(false); setToken(token) } },
      'expired-callback': () => { if (active) { setToken(''); setReload(value => value + 1) } },
      'error-callback': () => { if (active) { setToken(''); setFailed(true) } },
    })
    return () => { active = false; api.remove(id) }
  }, [action, captchaRequired, challengeVersion, ready, reload, setToken, sitekey])
  return <>
    {remaining > 0 && <p role="timer" aria-live="off" className="text-sm text-muted-foreground">Please wait {remaining} seconds before trying again.</p>}
    {captchaRequired && sitekey && <div className="flex flex-col gap-2">
      <p className="text-sm">Complete the security check to continue.</p>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setReady(true)} onError={() => setFailed(true)} />
      <div ref={container} />
      {failed && <div role="alert" className="text-sm">The security check could not load. Check your connection and try again.
        <Button type="button" variant="link" onClick={() => { if (!window.turnstile) { window.location.reload(); return }; setFailed(false); setReload(value => value + 1) }}>Retry security check</Button>
      </div>}
    </div>}
  </>
}

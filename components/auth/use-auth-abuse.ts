'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function useAuthAbuse() {
  const [remaining, setRemaining] = useState(0)
  const deadline = useRef(0)
  const [captchaRequired, setCaptchaRequired] = useState(false)
  const [token, setToken] = useState('')
  const [challengeVersion, setChallengeVersion] = useState(0)
  const receive = useCallback((result: object) => {
    setToken('')
    setChallengeVersion(value => value + 1)
    if ('captchaRequired' in result && result.captchaRequired === true) setCaptchaRequired(true)
    if ('retryAfter' in result && typeof result.retryAfter === 'number' && Number.isFinite(result.retryAfter)) {
      const seconds = Math.min(600, Math.max(0, Math.ceil(result.retryAfter)))
      deadline.current = Date.now() + seconds * 1000
      setRemaining(seconds)
    }
  }, [])
  useEffect(() => {
    if (remaining <= 0) return
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))), 1000)
    return () => window.clearInterval(timer)
  }, [remaining])
  return {
    remaining, captchaRequired, challengeVersion, token, setToken, receive,
    blocked: remaining > 0 || (captchaRequired && !token),
    isBlocked: () => Date.now() < deadline.current || (captchaRequired && !token),
    prepare: (data: FormData) => { if (token) data.set('captchaToken', token) },
  }
}

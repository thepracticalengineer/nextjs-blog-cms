'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

type Factor = { id: string; factor_type: string; status: string }

export function TwoFactorSetup() {
  const [factor, setFactor] = useState<Factor | null>(null)
  const [loading, setLoading] = useState(true)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)

  // Enroll dialog state
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [enrollLoading, setEnrollLoading] = useState(false)
  const [disableLoading, setDisableLoading] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function loadFactors() {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (!error && data.user) {
          const factors = (data.user as { factors?: Factor[] }).factors ?? []
          const verified = factors.find(
            (f) => f.factor_type === 'totp' && f.status === 'verified',
          )
          setFactor(verified ?? null)
        }
      } finally {
        setLoading(false)
      }
    }
    loadFactors()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleStartEnroll() {
    setEnrollLoading(true)
    try {
      // Clean up stale unverified factors that would block enrollment
      const { data: existing } = await supabase.auth.mfa.listFactors()
      for (const f of existing?.all ?? []) {
        if (f.factor_type === 'totp' && f.status !== 'verified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id })
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) {
        toast.error(error.message)
        return
      }
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setEnrollFactorId(data.id)
      setEnrollOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong — please try again')
    } finally {
      setEnrollLoading(false)
    }
  }

  async function handleVerifyEnroll() {
    if (!enrollFactorId || !verifyCode) return
    setEnrollLoading(true)
    try {
      const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: enrollFactorId,
      })
      if (challengeErr) {
        toast.error(challengeErr.message)
        return
      }

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: enrollFactorId,
        challengeId: challengeData.id,
        code: verifyCode,
      })

      if (verifyErr) {
        toast.error('Invalid code — please try again')
        return
      }

      setFactor({ id: enrollFactorId, factor_type: 'totp', status: 'verified' })
      setEnrollFactorId(null)
      setQrCode(null)
      setSecret(null)
      setEnrollOpen(false)
      setVerifyCode('')
      toast.success('Two-factor authentication enabled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong — please try again')
    } finally {
      setEnrollLoading(false)
    }
  }

  async function handleCancelEnroll() {
    if (enrollFactorId) {
      await supabase.auth.mfa.unenroll({ factorId: enrollFactorId })
    }
    setEnrollFactorId(null)
    setQrCode(null)
    setSecret(null)
    setVerifyCode('')
    setEnrollOpen(false)
  }

  async function handleDisable() {
    if (!factor) return
    setDisableLoading(true)
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
      if (error) {
        toast.error(error.message)
        return
      }
      setFactor(null)
      setDisableOpen(false)
      toast.success('Two-factor authentication disabled')
    } finally {
      setDisableLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>Requires an authenticator app on every login when active</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Authenticator App</p>
              <p className="text-xs text-muted-foreground">Google Authenticator, Authy, 1Password, etc.</p>
            </div>
            <Badge variant={factor ? 'default' : 'secondary'}>
              {factor ? (
                <><ShieldCheck className="mr-1 h-3 w-3" />Enabled</>
              ) : (
                <><ShieldOff className="mr-1 h-3 w-3" />Disabled</>
              )}
            </Badge>
          </div>

          {factor ? (
            <Button variant="destructive" size="sm" onClick={() => setDisableOpen(true)}>
              Disable 2FA
            </Button>
          ) : (
            <Button size="sm" onClick={handleStartEnroll} disabled={enrollLoading}>
              {enrollLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enable 2FA
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Enroll dialog */}
      <Dialog open={enrollOpen} onOpenChange={(open) => { if (!open) handleCancelEnroll() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set up authenticator app</DialogTitle>
            <DialogDescription>
              Scan the QR code with your authenticator app, then enter the 6-digit code to verify.
            </DialogDescription>
          </DialogHeader>
          {qrCode && (
            <div className="flex flex-col items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="2FA QR Code" width={180} height={180} />
              {secret && (
                <p className="text-xs text-muted-foreground text-center">
                  Can&apos;t scan? Use this key: <span className="font-mono font-semibold">{secret}</span>
                </p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="totp-code">Verification Code</Label>
            <Input
              id="totp-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replaceAll(/\D/g, ''))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelEnroll}>Cancel</Button>
            <Button onClick={handleVerifyEnroll} disabled={enrollLoading || verifyCode.length !== 6}>
              {enrollLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify &amp; Enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable confirm dialog */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication?</DialogTitle>
            <DialogDescription>
              Your account will only be protected by your password. You can re-enable 2FA at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDisable} disabled={disableLoading}>
              {disableLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Disable 2FA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

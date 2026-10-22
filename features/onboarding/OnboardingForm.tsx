'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveOnboarding } from './actions'
import { experiences, professions, referrals, onboardingSchema, onboardingReturnPath, type OnboardingProgress } from './validation'

type Props = {
  progress: OnboardingProgress
  profile: { full_name: string | null; email: string; avatar_url: string | null }
  tags: { id: string; name: string }[]
}
const titles = ['A little about you', 'How did you find us?', 'What do you want to explore?']
function Choices({ legend, name, options, value, onChange }: {
  legend: string; name: string; options: ReadonlyArray<readonly [string, string]>; value: string; onChange: (value: string) => void
}) {
  return <fieldset className="space-y-3"><legend className="mb-3 font-medium">{legend}</legend>
    <div className="grid gap-2 sm:grid-cols-2">{options.map(([id, label]) => <label key={id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-blue-600 ${value === id ? 'border-blue-600 bg-blue-50 text-blue-950 dark:bg-blue-950 dark:text-blue-100' : 'border-border hover:bg-muted'}`}>
      <input className="size-4 accent-blue-600" type="radio" name={name} value={id} checked={value === id} onChange={() => onChange(id)} />{label}
    </label>)}</div>
  </fieldset>
}
export function OnboardingForm({ progress, profile, tags }: Props) {
  const router = useRouter()
  const [saved, setSaved] = useState(progress)
  const profileNameChanged = progress.full_name !== null && progress.profile_name !== profile.full_name
  const [name, setName] = useState(profileNameChanged ? profile.full_name ?? '' : progress.full_name ?? profile.full_name ?? '')
  const [experience, setExperience] = useState(progress.experience)
  const [profession, setProfession] = useState(progress.profession)
  const [referral, setReferral] = useState(progress.referral)
  const [interests, setInterests] = useState(progress.interests)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const lock = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const alert = useRef<HTMLDivElement>(null)
  useEffect(() => { heading.current?.focus() }, [saved.step])
  useEffect(() => { if (error) alert.current?.focus() }, [error])

  async function save(step: number, complete = false, skip = false) {
    if (lock.current) return
    const input = { full_name: name, original_name: profile.full_name, experience, profession, referral: skip ? '' : referral, interests, step, revision: saved.revision, complete }
    const parsed = onboardingSchema.safeParse(input)
    if (!parsed.success) { setError('Enter your name and choose your experience and professional role to continue.'); return }
    if (complete && tags.length > 0 && interests.length === 0) { setError('Choose at least one topic to finish.'); return }
    let navigating = false
    lock.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await saveOnboarding(parsed.data)
      if (result.error || !result.progress) {
        setError(result.error ?? 'Unable to save. Please retry.')
        setConflict(result.conflict ?? false)
        return
      }
      setSaved(result.progress)
      setInterests(result.progress.interests)
      if (skip) setReferral('')
      if (result.progress.completed_at) {
        navigating = true
        router.replace(onboardingReturnPath(result.progress.return_to))
        router.refresh()
      }
    } catch { setError('Unable to save. Your answers are still here; try again.') }
    finally { if (!navigating) { lock.current = false; setBusy(false) } }
  }
  function toggle(id: string) {
    setInterests(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 32 ? [...current, id] : current)
  }
  const filtered = tags.filter(tag => tag.name.toLowerCase().includes(search.trim().toLowerCase()))
  return <section className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-14" aria-labelledby="onboarding-title">
    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">The Practical Engineer / Welcome</p>
    <ol aria-label="Setup progress" className="mb-10 grid grid-cols-3 gap-3">{['About you', 'Discovery', 'Interests'].map((label, index) => <li key={label} aria-current={saved.step === index ? 'step' : undefined} className={`border-t-2 pt-3 text-sm ${index <= saved.step ? 'border-blue-600 text-foreground' : 'border-border text-muted-foreground'}`}><span className="mr-1 font-mono">0{index + 1}</span> {label}</li>)}</ol>
    <h1 id="onboarding-title" ref={heading} tabIndex={-1} className="mb-3 text-3xl font-semibold tracking-tight outline-none sm:text-4xl">{titles[saved.step]}</h1>
    <p className="mb-8 text-muted-foreground">{saved.step === 0 ? 'Help us understand where you are in your engineering journey. Your experience and professional role are private.' : saved.step === 1 ? 'One optional question about what brought you here.' : 'Pick the topics you care about. Your interests are saved privately; they do not change article rankings.'}</p>
    {profileNameChanged && <p role="status" className="mb-4 text-sm text-muted-foreground">Your profile name changed since your last save. We have filled in the latest name.</p>}
    {error && <div ref={alert} tabIndex={-1} role="alert" className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">{error}
      {conflict && <Button className="mt-3" variant="outline" onClick={() => window.location.reload()}>Reload saved progress</Button>}
    </div>}
    <form onSubmit={event => { event.preventDefault(); void save(Math.min(2, saved.step + 1), saved.step === 2) }}>
      <fieldset disabled={busy || conflict} className="min-w-0 space-y-7">
        <legend className="sr-only">Step {saved.step + 1}: {titles[saved.step]}</legend>
        {saved.step === 0 && <>
          <div className="flex min-w-0 items-center gap-3 rounded-xl bg-muted p-4">
            {profile.avatar_url ? <Image src={profile.avatar_url} alt="Your profile photo" width={44} height={44} className="size-11 rounded-full object-cover" unoptimized /> : <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-800">{(name || profile.email).slice(0, 1).toUpperCase()}</span>}
            <div className="min-w-0"><p className="break-all text-sm font-medium">{profile.email}</p><p className="text-xs text-muted-foreground">You can change your photo later in Profile.</p></div>
          </div>
          <div className="space-y-2"><Label htmlFor="onboarding-name">Full name</Label><Input id="onboarding-name" autoComplete="name" maxLength={120} value={name} onChange={event => setName(event.target.value)} /></div>
          <Choices legend="Your experience (required)" name="experience" options={experiences} value={experience} onChange={setExperience} />
          <Choices legend="Your professional role (required)" name="profession" options={professions} value={profession} onChange={setProfession} />
          <p className="text-xs text-muted-foreground">Your profession describes you; it does not change your account permissions. Full name is required and appears on your author profile.</p>
        </>}
        {saved.step === 1 && <Choices legend="Referral source (optional)" name="referral" options={referrals} value={referral} onChange={setReferral} />}
        {saved.step === 2 && <>
          <div className="space-y-2"><Label htmlFor="topic-search">Search topics</Label><Input id="topic-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Try TypeScript, testing, architecture…" /></div>
          <p role="status" className="text-sm text-muted-foreground">{interests.length} of 32 topics selected{tags.length ? ' · Choose at least one' : ''}</p>
          {interests.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Selected topics">{interests.map(id => <Button key={id} variant="secondary" className="h-auto min-h-10 max-w-full whitespace-normal text-left" onClick={() => toggle(id)} aria-label={`Remove ${tags.find(tag => tag.id === id)?.name ?? 'unavailable topic'}`}>{tags.find(tag => tag.id === id)?.name ?? 'Unavailable topic'}<X className="size-3" /></Button>)}</div>}
          <div aria-label="Available topics" className="flex flex-wrap gap-2">{filtered.map(tag => <Button key={tag.id} aria-pressed={interests.includes(tag.id)} disabled={!interests.includes(tag.id) && interests.length >= 32} variant={interests.includes(tag.id) ? 'default' : 'outline'} className="h-auto min-h-11 max-w-full whitespace-normal text-left" onClick={() => toggle(tag.id)}>{interests.includes(tag.id) && <Check aria-hidden="true" />}{tag.name}</Button>)}</div>
          {!tags.length ? <p className="text-sm text-muted-foreground">Topics are still being prepared. You can finish without choosing interests.</p> : !filtered.length ? <p className="text-sm text-muted-foreground">No matching topics. Try another search.</p> : null}
          <p className="text-xs text-muted-foreground">This setup does not subscribe you to email. Newsletter signup is a separate, optional choice.</p>
        </>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
          {saved.step > 0 ? <Button variant="outline" className="min-h-11" onClick={() => void save(saved.step - 1)}>Back</Button> : <span className="text-xs text-muted-foreground">Saved when you continue</span>}
          <div className="flex flex-wrap gap-2">{saved.step === 1 && <Button className="min-h-11" variant="ghost" onClick={() => void save(2, false, true)}>Skip this question</Button>}
            <Button type="submit" className="min-h-11 px-5">{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}{busy ? 'Saving…' : saved.step === 2 ? 'Finish setup' : 'Continue'}</Button>
          </div>
        </div>
      </fieldset>
    </form>
  </section>
}

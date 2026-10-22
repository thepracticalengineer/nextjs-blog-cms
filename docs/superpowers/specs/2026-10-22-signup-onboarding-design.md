# Signup onboarding (#146)

## Intent and scope
New accounts complete a short guided introduction after authentication, email confirmation and MFA. Collect useful private context without implying personalized ranking or changing CMS permissions. Existing accounts are exempt.

## Product decisions (implementation defaults)
Use three responsive steps in the existing application visual language:
1. About you: prefilled name and existing avatar/email, experience (learning, less than 1 year, 1–3 years, 3–5 years, 5–10 years, 10+ years), and profession (software engineer, engineering manager, founder, DevOps engineer, AI engineer, data engineer, student, product manager, designer, other). Name, experience and profession required.
2. Discovery: optional single-choice referral source (LinkedIn, GitHub, search engine, friend/colleague, blog/newsletter, other, don't remember). Skip is explicit.
3. Interests: search existing CMS tags, select one or more, finish. If taxonomy is empty, allow completion without interests with explanatory copy.

Avatar editing stays in Profile. Email is read-only. Username creation is excluded because the CMS has no username concept. Newsletter enrollment remains the existing separate subscription flow; onboarding does not subscribe or re-subscribe anyone. No extension promotion or recommendation engine. Preferences are not edited after completion in this change.

## Persistence and rollout
Ordered migration creates owner-private onboarding progress keyed to profiles. Existing profiles receive no row and are exempt. Extend the new-account profile trigger to create a progress row only for future accounts. Record schema version, current step, answers, safe intended destination and completion timestamp. Persist each Continue/Back/Skip transaction; refresh resumes last saved state. Failed saves retain local inputs and offer retry, never mark complete or navigate. Serialize updates with a revision to reject stale tabs and lock completion.

Profile name update, answer save and completion are atomic in a database function. Validate fields, step transitions, interest IDs and completion server-side and in SQL. Professional-role values never write profiles.role. RLS and function ownership checks reject other users; assurance checks preserve MFA. Keep public_author_profiles unchanged. No service role client for onboarding writes.

## Routing
Onboarding lives under /dashboard/onboarding so existing safe-return rules and MFA checks apply. After assurance checks, dashboard requests from eligible incomplete users enter onboarding, with the sanitized original destination. Public /blog return destinations also pass onboarding after login/OAuth/MFA via a shared server destination resolver. Login, immediate signup, OAuth and signup-confirmation use the resolver. Email-confirmation return targets use an email-bound, expiring HMAC token minted by the server before signup. The fixed email template transports the opaque signed token using signup metadata; editable metadata itself never provides destination authority. Recovery keeps its existing independent routing and grants. Never use onboarding itself as a completion destination. Existing/completed accounts retain current routing.

## Accessibility and feedback
Single-choice native radio groups, pressed-state interest buttons, visible labels, a step indicator, keyboard controls, focus moved to each step heading, polite save feedback and focused error messages. Disable duplicate submissions. Support 320px and desktop layouts. Search does not hide selected choices permanently; show selected count and removable selected chips.

## Verification
Unit tests for validation, routing, new/existing/completed accounts, assurance, progress/revision failures and form navigation/retry. Rolled-back SQL assertions for eligibility, ownership, grants, invalid inputs and atomic completion. Browser checks cover desktop/mobile completion, refresh/resume and failed saves on a disposable local environment. Run typecheck, lint, unit suite, docs checks and appropriate database/browser checks. Report unavailable live verification honestly.

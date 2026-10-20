# Password recovery
The login page links to `/forgot-password`. Requests use Supabase Auth and always
show the same confirmation for registered and unregistered email addresses.
Passwords must contain at least eight characters, matching registration and
account settings. Signup, recovery and account-settings server actions enforce
this policy even when browser validation is bypassed. Local Auth also rejects
new passwords shorter than eight characters, including direct provider updates. Login still accepts older six-character passwords.
Additional Supabase password rules are enforced by Auth and reported during recovery.

## Account-settings password changes and provider policy

Account settings validates both passwords and an optional six-digit email code
at runtime before password verification or an Auth update. The current password only needs to be a
nonempty string, so legacy six-character passwords remain usable. Passwords are
never trimmed. The action verifies the current password through a stateless
client, revokes that temporary verification session with local scope, then
updates the original authorized session to preserve MFA assurance. Cleanup is
best effort on Auth outages and never revokes the caller's session.

Local Auth enables secure password change. Auth permits sessions created within
the last 24 hours to change a password without an email code; this is a provider
exception, not a promise that every change needs email verification. For older
sessions, Auth returns `reauthentication_needed`. The action calls
`auth.reauthenticate()` on the original session and the form retains the password
fields while requesting the email code. The retry sends `nonce` with the new
password. Invalid/expired codes preserve the challenge; resend is explicit and
provider email rate limits still apply. A password sign-in on a separate client
cannot satisfy this original-session requirement. MFA authorization remains
mandatory for enrolled accounts before changing a password or requesting a code.

New recovery sessions qualify for the provider's recent-session exception. The
application's 15-minute, single-use recovery grant and TOTP verification remain
required by the reset action. These grants do not constrain direct Auth API
requests: provider password policy, session age and MFA enforce that boundary.
A failed provider update consumes the recovery grant and requires a new link.

### Deployment requirements and verification

Deploy the application with the nonce flow **before** enabling secure password
change in the hosted project. Committed `supabase/config.toml` settings configure
the local stack; they do not prove or update hosted Auth settings.

Record the project, deployment SHA, verification date and results of these checks
in the deployment record. Do not put access tokens or SMTP credentials in it.

- In hosted Authentication password settings, require a minimum of **8**
  characters and enable **secure password change / reauthentication**. Keep the
  current-password provider requirement disabled for this rollout; the CMS
  verifies it itself and OAuth accounts set passwords through verified recovery.
  Enabling an additional provider requirement needs separate compatibility tests.
- Keep character-composition requirements unset for this change to match the
  shared application policy. Auth can enforce a stronger future policy, but
  document it and check signup, account settings and recovery error handling.
- Enable **leaked-password protection** on hosted Pro or higher plans. This is
  the chosen hosted requirement when available, enforced by Auth for new/changed
  passwords; the app does not send passwords to an additional service. On a plan
  without support, record that limitation explicitly before rollout. Local Auth
  does not verify hosted HIBP enforcement. See
  [Supabase password security](https://supabase.com/docs/guides/auth/password-security).
- Enable **password changed** security notifications and configure production
  SMTP. Copy `supabase/templates/password_changed.html` into the hosted Password
  Changed notification template and `supabase/templates/reauthentication.html`
  into the Reauthentication template. The latter must include `{{ .Token }}`.
  Keep email OTP length at **6** digits. Check delivery and rate limits with a
  designated test account; never include the password or code in logs.
- Use a designated non-production project with external integrations disabled
  to verify direct Auth rejects six/seven-character new passwords, a recent
  session accepts eight characters, an older session requires the correct nonce,
  wrong/replayed nonces fail, enrolled AAL1 cannot update passwords, and AAL2 can.
  Confirm a legacy six-character account can still sign in. Then test ordinary
  and MFA recovery, single-use grants, and password-change notifications.
- Confirm the production dashboard settings separately without seeding or
  resetting production. Local tests cannot establish hosted policy or delivery.

Run the policy browser tests and existing recovery tests against an isolated local
stack with Mailpit and Docker (see [testing](../development/testing.md)):

```bash
pnpm exec playwright test e2e/browser/password-policy.spec.ts e2e/browser/password-recovery.spec.ts --project=browser
```

The older-session fixture ages only its disposable user's `auth.sessions` row in
`supabase_db_nextjs-blog-cms` (or the isolated `supabase_db_cms-issue104` stack via
`E2E_AUTH_DB_CONTAINER`). It refuses remote URLs and other container names. The
suite captures actual email codes and notifications in local Mailpit and modifies
a real Server Action request to bypass browser password validation.

Before deploying this feature:

1. Apply the `add_password_recovery_grants` migration. Its table has RLS enabled
   and no `anon`/`authenticated` privileges; only server-side service-role code
   can create and consume grants. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
2. Set `NEXT_PUBLIC_SITE_URL` to the trusted application origin, such as
   `http://localhost:3000` locally or `https://blog.frankmendez.site` in production.
   Do not derive email destinations from incoming request headers.
3. In Supabase **Authentication → URL Configuration**, set the Site URL and allow
   these exact redirects (use your production origin in place of the example):
   - `http://localhost:3000/auth/callback?next=/reset-password`
   - `http://127.0.0.1:3000/auth/callback?next=/reset-password`
   - `https://blog.frankmendez.site/auth/callback?next=/reset-password`
   Keep the [signup confirmation](signup-confirmation.md) `/auth/callback?type=signup` redirects allowed as well.
4. In **Authentication → Email Templates → Reset Password**, copy
   `supabase/templates/recovery.html`. Its link must be
   `{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery`.
   This verifies the recovery OTP on the server and works when opened in another
   browser. The default `ConfirmationURL` template is not compatible with this
   recovery flow; old/default recovery links show an actionable retry message.
   Local Supabase loads the template from `supabase/config.toml` automatically;
   restart the local stack after changing email templates.
5. Configure production SMTP and appropriate email/OTP rate limits and expiry in
   Supabase. Local email is captured by Mailpit (`supabase status` shows its URL).
   The request action hides address-specific email throttling/account errors;
   global throttling and delivery outages show neutral retry errors.

A verified email creates a 15-minute HttpOnly recovery capability bound to the
Supabase user and session. A normal login session cannot reset a password. The
reset page checks the capability, and the update action atomically deletes its
database row before calling `auth.updateUser`. Expired, invalid, consumed, and
replayed capabilities cannot authorize updates. Provider update failures also
consume the capability and require a new email. Authenticator verification
failures happen before consumption and can be retried. Successful updates request global sign-out, clear browser credentials even
if Auth sign-out is unavailable, and offer a link to sign in with the new
password. Supabase access tokens already issued may remain valid until their
normal expiry.
Deploy migration `20261006152137_limit_recovery_mfa_attempts.sql` before enabling
this flow.

Accounts with a verified TOTP authenticator are prompted for a six-digit code
before the recovery grant is consumed. Invalid or expired codes can be retried
within the grant's 15-minute lifetime, up to five verification attempts. Each
attempt is reserved atomically in the database before calling Auth, including
concurrent requests. The fifth failed code invalidates the grant; a new reset
email is then required. Interrupted verification calls also use an attempt. Supabase verifies the factor and upgrades
the recovery session before the password change. Other verification methods
require administrator assistance. Account-settings password changes remain
outside this flow.

Expired grant rows are unusable and are automatically deleted before a new
recovery grant is issued. This uses the expiry index and removes abandoned grants
across all users. During periods without recovery traffic, expired rows can also
be removed with `delete from public.password_recovery_grants where expires_at < now();`.

Run `pnpm exec vitest run __tests__/auth __tests__/lib/proxy.test.ts` for recovery
unit/component tests. Run
`pnpm exec playwright test e2e/browser/password-recovery.spec.ts --project=browser`
against the dedicated disposable test environment described in [testing](../development/testing.md). Set
`E2E_MAILPIT_URL` to its Mailpit origin (for example `http://127.0.0.1:54324`). The
browser test requests a real email, follows its actual link in a fresh browser,
checks validation, changes the password, verifies new-password sign-in and
old-password rejection, and verifies that the same link cannot be reused.

Accounts with Google/GitHub identities use this same verified email and MFA flow to set a first password or reset an existing one. This policy also applies to linked accounts that already have an email/password identity: their Security panel intentionally uses verified recovery instead of the current-password form. An email identity alone does not establish that the account has a usable password. See [social authentication](../setup/social-auth.md).

## MFA enforcement across private interfaces

Verified enrollment makes AAL2 mandatory for private session access, regardless of
whether the first factor is a password or an OAuth provider. Accounts without a
verified factor continue to work at AAL1. Unverified enrollment does not lock an
account out.

The dashboard proxy, server authorization helper and cookie-authenticated APIs
check assurance. `authorizeSession` verifies the user with Auth before checking
assurance and the private profile/role; `getProfile` remains the fail-closed action
wrapper. `authorizeApi` returns structured errors before request parsing, private
queries, provider calls or service-role access. AI Providers settings require owner scope after authorization, including for administrators. Retired AI routes return 410 without reading private data. Protected layouts
redirect an incomplete session to `/mfa`; provider/database outages fail rendering
instead of creating an MFA redirect loop.

Migration `20261012103751_enforce_mfa_assurance.sql` adds restrictive policies for
private profiles, working copies, AI data, API/provider keys and storage metadata
and operations across all buckets, including authenticated avatar and post-media
uploads. It also gates mutations of posts, taxonomy and comments, and
private post/tag reads. The enrollment check reads `auth.mfa_factors` through a
restricted, non-exposed helper bound to `auth.uid()`, so stale pre-enrollment JWTs
cannot opt out. Existing ownership/role policies still apply. Published content,
public taxonomy/comments, public image URLs and the limited owner-executed
`public_author_profiles` projection remain public.

Service-role clients bypass these policies: session callers must pass the shared
guard first. Existing developer API keys are revoked by the retirement migration; all retired routes return `410 API_RETIRED` regardless of credentials. Provider-key management requires the session guard and owner checks. Cron, webhook, newsletter capability and
password-recovery grants retain their own authorization contracts. MFA enrollment,
challenge and recovery must remain reachable before completing MFA.

Run the MFA checks in [testing](../development/testing.md#mfa-boundary-verification)
before rollout. Apply the migration before deploying the application changes.

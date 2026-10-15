# Signup confirmation

Signup requires email confirmation. The confirmation email opens
`/auth/callback?type=signup&token_hash=…`, where the server calls
`verifyOtp` with the fixed `signup` type and establishes the browser session.
It does not require the initiating browser's PKCE verifier. Success always goes
to `/dashboard`; query-string destinations are ignored. Signup never creates a
password-recovery grant. OAuth and password recovery retain their separate flows.

Missing, invalid, expired and already-used signup links return to login with a
safe confirmation-specific message. A person who already confirmed can sign in;
otherwise the login and registration screens link to `/confirm-email`.
Legacy PKCE signup links also require a new link after rollout.

The resend form validates email on the client and server and fixes the provider
type to `signup`. It displays the same conditional message and a 60-second
cooldown for every provider response, including unknown addresses, confirmed
accounts, email throttles and delivery errors. This does not promise delivery or
disclose whether an account exists. Transport/configuration failures show a safe
retry message. Supabase's per-address send interval enforces throttling across
browsers and application instances; the UI timer alone is not an abuse control.
Monitor Auth/SMTP logs for delivery outages without exposing those details to
the person requesting a link.

## Deployment and rollback

1. Set `NEXT_PUBLIC_SITE_URL` to the trusted application origin. HTTPS is required
   except for loopback local development. Do not use request headers to construct
   email links. Set Supabase's Site URL to that same origin so brand/home links
   use the correct domain.
2. Allow the exact signup redirects below in Supabase URL Configuration. Replace
   the production example with the configured origin and add each designated
   preview origin explicitly; do not use wildcard redirects.

   | Environment | Signup redirect |
   | --- | --- |
   | Localhost | `http://localhost:3000/auth/callback?type=signup` |
   | Loopback IP | `http://127.0.0.1:3000/auth/callback?type=signup` |
   | Production example | `https://www.thepracticalengineer.online/auth/callback?type=signup` |

   Retain the exact [OAuth](../setup/social-auth.md#application-origins-and-redirect-allowlists)
   and [recovery](password-recovery.md) redirects. Remove the old bare signup
   `/auth/callback` redirects after the new flow is deployed.
3. Deploy the application, then install `supabase/templates/confirm.html` in
   **Authentication → Email Templates → Confirm signup**. Both the CTA and copyable
   fallback must use `{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}`.
   Registration and resend set `.RedirectTo` to the exact signup callback above;
   do not substitute `.ConfirmationURL`. In-flight old emails fail safely and
   offer resend. For rollback, restore the old application, template and redirect
   allowlists together; neither callback format is compatible with the other.
4. Enable email confirmations, set email OTP expiry to **3600 seconds** and the
   minimum email send interval to **60 seconds** in hosted Auth settings. The
   committed local config matches these values. Changing expiry requires updating
   the email and UI copy together. The send interval also applies to password
   recovery. Configure SMTP and suitable project-wide request/email limits.
5. Restart local Supabase after template/config changes. For hosted Supabase,
   committing `config.toml` does not update the dashboard settings or template.
6. On a designated non-production project, verify real delivered signup emails
   in both initiating and fresh browsers, replay/expiry failures, invalid types,
   neutral resend and server-enforced cooldown. Recheck OAuth and recovery.
   Record the deployed SHA and actual hosted configuration before release.

The confirmation template's existing visual treatment is retained. Issue #88
owns shared email presentation and email-client rendering checks; preserve the
token-hash link, one-hour expiry copy and configured `.SiteURL` brand link when
coordinating that work. This change does not assert Gmail/Outlook rendering.

## Verification

Run the auth unit suite and signup browser regression described in
[testing](../development/testing.md#signup-confirmation).
The browser regression captures real emails in loopback Mailpit, confirms real
Auth sessions, tests replay and resend, and ages only its disposable user's
confirmation timestamp to exercise expiry. No production data is needed.

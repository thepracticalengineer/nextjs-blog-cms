# Authentication abuse controls

Login, signup, password recovery, confirmation resend, password verification/change
and reauthentication email requests reserve shared Postgres budgets before calling
Auth. Provider limits remain in force. OAuth, session refresh and MFA retain their
existing provider/session/recovery controls; this migration does not change them.
The older `lib/rateLimit.ts` is still used by unrelated APIs, not by authentication.
These are application-entry-point controls. Direct calls to the public Supabase
Auth API remain governed by provider limits and do not pass through these counters
or progressive challenges. Provider-wide bot enforcement requires a compatible
provider CAPTCHA/gateway design; this rollout does not replace that boundary.

## Deployment prerequisites

1. Apply `20261016080047_auth_abuse_controls.sql` before deploying this code.
2. Set server-only `AUTH_ABUSE_HMAC_KEY` to an independent random secret of at least
   32 characters (for example, generate 32 random bytes with your secret manager).
   Use the same value on every instance sharing a database. Do not reuse provider,
   service-role or encryption credentials. Rotation starts new budgets, so coordinate
   it across instances. Set it in local development and disposable E2E environments too.
3. Set `AUTH_TRUSTED_IP_HEADER=x-vercel-forwarded-for` on Vercel. On another ingress,
   choose a header that the trusted proxy **overwrites** with one validated client IP;
   block direct access to the application origin. Merely naming a header does not
   make it trustworthy. Do not append user-supplied forwarding chains. Generic
   `x-forwarded-for`, `x-real-ip` and `Forwarded` are never automatic fallbacks.
   Missing, invalid, comma-separated, port-bearing or scoped addresses fail closed
   when a header is configured. IPv6 spellings and IPv4-mapped addresses normalize.
   With no configured header, development uses a shared `unknown` IP budget;
   production returns temporary-unavailability feedback. Local production tests
   must explicitly configure their local ingress header too.
4. To enable progressive bot protection, set public build-time
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and server-only `TURNSTILE_SECRET_KEY` together.
   Configure the widget's allowed hostnames and set trusted `NEXT_PUBLIC_SITE_URL`
   to the exact app origin. Rebuild/redeploy after changing the public key. Enable
   this pair for production rollout; omitting both deliberately runs shared
   throttling alone. A partial pair fails closed. This app validates Turnstile
   itself only after escalation: do not also enable mandatory Supabase CAPTCHA
   with this widget/token, since that would require CAPTCHA on every provider call
   and a single-use token cannot be verified twice. Existing Auth rate limits
   must remain enabled. Sites already requiring provider CAPTCHA need a separate
   provider-CAPTCHA integration before adopting this progressive mode.

See [Vercel request headers](https://vercel.com/docs/headers/request-headers),
[Turnstile verification](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
and [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha).

## Budgets and feedback

Each operation uses independent account and IP fixed windows, starting with its
first attempt and expiring after **10 minutes**. A request must fit both budgets.
All syntactically valid attempts count, including successful calls and failed or
missing bot tokens. Invalid fields are rejected before reserving a budget.

| Operation | Account attempts | IP attempts |
| --- | ---: | ---: |
| Login | 10 | 100 |
| Signup | 5 | 20 |
| Recovery email | 5 | 30 |
| Confirmation email | 5 | 30 |
| Password verification/change | 10 | 100 |
| Reauthentication email | 3 | 30 |

Public operations require Turnstile after the third account attempt or fifteenth
IP attempt in a window when configured. The server validates the token's success,
action and exact hostname. Tokens are single-use/short-lived at Turnstile; the UI
clears them after every response and regenerates expired challenges. A solved
challenge never bypasses a hard budget. Authenticated password operations use the
server-authorized profile ID for their account budget and do not require CAPTCHA.
Automatic reauthentication emails use the same budget as explicit resends.

Cooldowns return neutral text and `retryAfter` seconds. Forms disable email/password
submission until that deadline, preserve inputs, and allow retries afterward.
OAuth controls remain available. Provider 429 responses use a conservative
60-second UI cooldown, not a claim about the provider's exact reset time. Recovery
email-specific errors and all returned confirmation resend outcomes remain neutral;
confirmation resend retains its existing 60-second UI cooldown.

Blocked retries never extend the original database deadline. There is no permanent
account lock or reset-on-success path that would allow attackers to erase budgets.
Store/configuration failures fail closed before Auth with a neutral 30-second retry.
Database statements and network checks have bounded timeouts. Provider 429 limits
still apply independently, including shared server-egress limits.

## Privacy and operations

The service-role-only invoker RPC can reserve budgets but cannot be executed by
anonymous/authenticated database clients. Its RLS-protected table has no client
policies or grants. It holds domain-separated HMACs of normalized email/profile ID
and canonical IP; it never looks up whether an account exists. The privileged client
is only used for this narrow reservation, before authentication, not for account data.
Passwords, raw email/IP, bot tokens and provider/store errors are not logged by these
controls. HMACs are pseudonymous and must still be treated as private operational data.

An expiry index supports bounded cleanup of up to 100 rows older than one day per
reservation. Idle databases retain expired rows until another reservation or operator
cleanup; for a strict retention deadline schedule a database job deleting expired
rows older than one day. Never expose counters through analytics or public APIs.
Monitor database health and row growth through private infrastructure metrics. A
missing migration/secret or unavailable database blocks these auth actions, so
verify prerequisites before switching traffic. Roll back application code first
if needed; the additive table/function can remain while older instances run.

## Verification

Run `pnpm exec vitest run __tests__/auth __tests__/features/profile/actions.test.ts
__tests__/components/profile/ChangePasswordForm.test.tsx` for guard ordering,
privacy, spoofed headers, safe provider 429s, progressive checks, token reset and
cooldown retry behavior. Run `database/tests/auth_abuse.sql` against a migrated
**disposable** database for permissions, expiry and IP/account rotation assertions.
`node database/tests/auth-abuse-concurrency.mjs` uses 40 independent connections to
the designated local `supabase_db_nextjs-blog-cms` Docker container. It expects ten
allowed attempts and thirty rejections, and deletes only its random hashed fixtures.
It refuses arbitrary container names or hosted connection strings. CI runs both.
Run `pnpm exec playwright test --config=e2e/auth-abuse.config.ts` for desktop/mobile
real server-action cooldown, provider-429, outage and legitimate retry flows. This
suite uses loopback synthetic Auth/store responses with external requests blocked;
it does not need a database, live bot provider or external mail.

The SQL and unit tests do not prove production ingress trust or live bot/provider
configuration. Before rollout, use a designated non-production deployment with
external mail/webhooks disabled: verify missing/spoofed forwarding headers cannot
change the observed budget, exercise the fourth public attempt with Turnstile,
check rejected/replayed/expired tokens and exact hostname restrictions, confirm
that known/unknown emails have matching feedback, and retry after cooldown expiry.
Never load-test production Auth or send live email as part of automated checks.

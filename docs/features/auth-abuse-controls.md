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

1. Apply `20261016080047_auth_abuse_controls.sql` and
   `20261016090958_auth_abuse_review_fixes.sql` before deploying this code.
   The updated guard uses a v2 key namespace and starts fresh budgets; coordinate
   deployment across instances.
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
   when a header is configured. IPv4-mapped addresses normalize to IPv4; IPv6 addresses share a canonical /64
   prefix budget so rotating interface addresses cannot evade IP limits.
   With no configured header, development uses a shared `unknown` IP budget;
   production returns temporary-unavailability feedback. Local production tests
   must explicitly configure their local ingress header too.
4. To enable progressive bot protection, set public build-time
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and server-only `TURNSTILE_SECRET_KEY` together.
   Configure the widget's allowed hostnames and set trusted `NEXT_PUBLIC_SITE_URL`
   to the canonical app origin. For aliases/previews, add exact comma-separated
   hostnames to server-only `AUTH_TURNSTILE_HOSTNAMES`, and allow those hostnames in
   the widget configuration too. No wildcard or request Host/forwarded-host trust
   is added. Rebuild/redeploy after changing the public key. Enable
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

All IP reservations use a fixed **10-minute** window. Every valid request counts
against its IP budget, including missing/rejected proof and successful logins.
An exhausted IP cannot create more account rows by rotating email addresses.

| Operation | Account threshold | IP attempts |
| --- | ---: | ---: |
| Login | 10 failures (or proof after 3 failures) | 100 |
| Signup | 5 requests (or proof after 3 requests) | 20 |
| Recovery email | 5 requests (or proof after 3 requests) | 30 |
| Confirmation email | 5 requests (or proof after 3 requests) | 30 |
| Password verification/change | 10 requests | 100 |
| Reauthentication email | 3 requests | 30 |

With Turnstile configured, public account pressure is global, but only escalates
to a challenge: it never imposes a hard account lockout. Proof is required after
three account events or fifteen IP requests. Missing/rejected proof consumes IP
budget without charging account state. Valid proof permits progress even when an
attacker has saturated account pressure, while the hard IP budget remains in
force. The IP phase atomically reserves capacity before any outbound verification;
account finalization reuses that reservation without charging IP twice. Supplied
tokens are verified before account work; success, action and an
explicitly allowed hostname must match. Each token is consumed once. Browser
transport errors and expired challenges both trigger a fresh widget token.

When both bot keys are absent, public account budgets are scoped to the
**account + source IP/prefix** pair, so another source cannot impose a global
victim lockout. This mode does not provide global distributed account bot checks;
enable Turnstile for production. Shared NAT/prefix IP limits still affect clients
behind the same source, as with any IP budget.

Login account counters record only actual provider credential rejections, not
successful logins, provider 429s or transport outages. Success never clears other
concurrent failures. In-flight requests may finish after a failure is recorded;
the IP reservation remains the atomic bound on concurrent provider requests.
Signup and mail counters record admitted requests. Rejected bot challenges never
charge those counters. Account first-use races are serialized in Postgres.
Authenticated password actions keep hard budgets keyed by the authorized user ID;
automatic reauthentication email and explicit resend share the same budget.

Cooldowns return neutral text and `retryAfter` seconds. Forms disable email/password
submission until that deadline, preserve inputs, and allow retries afterward.
OAuth controls remain available. Provider 429 responses use a conservative
60-second UI cooldown, not a claim about the provider's exact reset time. Recovery
email-specific errors and all returned confirmation resend outcomes remain neutral;
confirmation resend retains its existing 60-second UI cooldown.

Blocked retries never extend the original database deadline. There is no global public-account hard lock or reset-on-success path that would
allow attackers to erase concurrent failures.
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
`database/tests/auth_abuse_review.sql` covers successful login repetition and
tokenless victim-lockout/proof recovery regressions.
`node database/tests/auth-abuse-concurrency.mjs` uses independent connections to
the designated local `supabase_db_nextjs-blog-cms` Docker container. It checks 10/30 allowed/blocked authenticated password attempts, 40 allowed login
reservations, and three admitted/37 challenged recovery requests from distinct IPs.
It deletes only its random hashed fixtures.
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

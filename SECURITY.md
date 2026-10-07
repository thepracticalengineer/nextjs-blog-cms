# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| `main`  | ✅ Yes     |

Only the latest code on the `main` branch receives security fixes. If you are running an older fork or snapshot, upgrade to the latest commit before reporting an issue.

---

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately by using [GitHub's private vulnerability reporting](https://github.com/frank-mendez/nextjs-blog-cms/security/advisories/new) feature.

Include the following in your report:

- A clear description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept, request/response samples, or code snippets)
- The affected component(s) or file path(s)
- Any suggested mitigation or fix (optional)

You can expect an acknowledgement within **72 hours** and a resolution or status update within **14 days**. Please do not disclose the issue publicly until a fix has been released.

---

## Security Features

### Authentication

- User authentication is handled by **Supabase Auth** (email/password and session-based).
- Protected dashboard pages use session-based authentication, while API routes use the mechanism appropriate to each endpoint: some require a user session, some accept developer API keys, webhook endpoints validate an `x-webhook-secret`, and some endpoints are intentionally public (for example, rate-limited submission routes).
- Server-side session helpers (`lib/auth/session.ts`) are used to enforce authentication for pages/layouts and redirect unauthenticated users to `/login`; API handlers use endpoint-specific auth checks instead of page redirects.

### Role-Based Access Control

- Two roles are supported: **Admin** (full control) and **Author** (own posts only).
- Access control is enforced at the database level via **Supabase Row Level Security (RLS)** policies defined in `database/policies/`.
- Client-side permission helpers (`lib/permissions/`) provide additional UI-level gating.

### API Key Authentication

- Developer API keys use the format `fmblog_<64 hex characters>`.
- Only a **SHA-256 hash** of the key is stored in the database — the raw key is shown once at generation time and never stored in plaintext.
- Keys are validated on every request by `lib/apiAuth.ts` and can be revoked at any time from the Developer Settings dashboard.

### LLM Provider Key Encryption

- User-supplied LLM API keys (Anthropic, Google, OpenAI) are encrypted at rest using **AES-256-GCM** before being written to the database (`lib/encryption.ts`).
- Encryption requires a 32-byte secret (`LLM_KEY_ENCRYPTION_SECRET`) stored as an environment variable — never committed to source control.
- Authentication tags are verified on decryption, so any tampering with the ciphertext is detected and rejected.

### Rate Limiting

- Selected API routes apply in-memory rate limiting via `lib/rateLimit.ts` when the handler calls `checkRateLimit`.
- Requests to rate-limited endpoints that exceed the limit receive a `429 Too Many Requests` response with a `retry_after` value.
- **Note:** The current implementation uses a Node.js in-memory `Map`. For endpoints that use this rate limiter, state is not shared across instances in a multi-instance (horizontally scaled) deployment. For production scale, replace it with a distributed store such as Redis/Upstash (see the TODO comment in `lib/rateLimit.ts`).

### Newsletter Scheduler Secrets

- Vercel Cron calls `GET /api/newsletter/send` with `Authorization: Bearer <CRON_SECRET>`. Configure a strong random `CRON_SECRET` in the Production environment and redeploy.
- Optional external schedulers may call `POST /api/newsletter/send` with `x-webhook-secret` matching `WEBHOOK_SECRET`. The POST secret does not authorize Vercel GET requests.
- This prevents unauthorized parties from triggering bulk email sends.

### Content Security

- Post content is stored as a serialised TipTap JSON document (not raw HTML).
- The `EditorContent` component (`components/editor/EditorContent.tsx`) renders content by walking the TipTap JSON tree and constructing HTML strings.
- If JSON parsing fails the raw string is injected via `dangerouslySetInnerHTML`. Ensure post content written to the database originates only from the TipTap editor or the validated API, never from untrusted external sources without sanitisation.
- The `sanitize-html` library is available as a dependency and is used where raw HTML input cannot be avoided.

---

## Deployment Security Checklist

Before deploying to production, confirm the following:

- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` reference a production project, not a development or test one.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is kept **server-side only** and never exposed to the browser.
- [ ] `LLM_KEY_ENCRYPTION_SECRET` is exactly 32 bytes and stored as a secret environment variable — never committed to source control.
- [ ] `CRON_SECRET` is a strong, randomly generated Production secret and the deployed GET handler validates its bearer header.
- [ ] If an external POST scheduler is used, `WEBHOOK_SECRET` is configured server-side and sent by that scheduler as `x-webhook-secret`.
- [ ] All RLS policies from `database/policies/` have been applied to the production Supabase project.
- [ ] Supabase Auth email confirmations are enabled so that only verified addresses can complete registration.
- [ ] The Supabase service role key is **not** exposed in client-side code or public environment variables.
- [ ] Rate limiting is reviewed and, for multi-instance deployments, backed by a distributed store (Redis/Upstash).

---

## Dependency Security

Dependencies in `package.json` use caret/semver ranges, which generally pin updates to the same major version (with special handling for `0.x` versions). It is recommended to:

- Regularly run `npm audit` and address reported vulnerabilities.
- Keep Next.js, Supabase libraries, and AI SDK packages up to date, as they receive active security patches.
- Review any new dependency before adding it to the project.

---

## License

This project is licensed under the [MIT License](LICENSE). Security disclosures are handled separately from licensing.

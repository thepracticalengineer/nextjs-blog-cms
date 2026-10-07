# Next.js Blog CMS

A full-stack Blog CMS built with Next.js (App Router), Supabase, TailwindCSS, and shadcn/ui. Features Supabase Auth with role-based access control, a WYSIWYG editor, draft/publish workflow, newsletter subscriptions, an AI writing assistant, a headless REST API, and MCP-powered development workflows.

---

## Features

- Authentication via Supabase Auth
- Role-Based Access Control — Admin and Author roles enforced through Supabase RLS
- WYSIWYG editor powered by TipTap with rich text, images, and formatting
- Draft and publish workflow
- Tags and categories
- Comments — authenticated, thread-style, with admin management
- SEO-friendly public blog pages with meta title and description support
- Developer API — generate API keys in the dashboard to create posts from external tools (n8n, Postman, scripts)
- AI Writing Assistant — chat with uploaded books (PDF) using Claude, Gemini, or OpenAI; generate full blog post drafts from conversation context
- LLM provider key management — store encrypted API keys (AES-256-GCM) for Claude, Gemini, and OpenAI per user
- Headless AI post generation via `POST /api/ai-assistant/generate`
- Newsletter subscriptions — readers subscribe from a widget on every post; email sent automatically on publish via Resend after a configurable delay; one-click unsubscribe via token
- REST API for posts — list, create, read, update, delete via authenticated endpoints
- In-memory rate limiting on API routes
- Favicon support
- Fast Vercel deployment

---

## Tech Stack

- **Frontend:** Next.js (App Router)
- **Backend:** Supabase (Postgres + Auth + Storage)
- **Styling:** TailwindCSS + shadcn/ui
- **Editor:** TipTap
- **AI Providers:** Anthropic (Claude), Google (Gemini), OpenAI
- **Deployment:** Vercel
- **AI Dev Layer:** Claude Code + MCP Servers

---

## MCP Servers

This project is optimized for AI-assisted development using MCP servers:

- `github-mcp` — repo management, PRs, commits
- `supabase-mcp` — database schema, queries, RLS
- `vercel-mcp` — deployments and env management
- `filesystem-mcp` — file editing and refactoring
- `browser-mcp` — UI testing and debugging
- `postgres-mcp` (optional) — query optimization

---

## Project Structure

```
app/
  (public)/        → public blog pages
  (dashboard)/     → admin & author dashboard
  (ai)/            → AI assistant (full-screen layout)
  api/             → backend routes

components/
  ui/              → reusable UI (shadcn/ui)
  editor/          → TipTap WYSIWYG editor
  blog/            → blog components

features/
  posts/
  users/
  auth/
  comments/

lib/
  supabase/
  permissions/
  utils/

database/
  schema.sql
  migrations/
  policies/

agents/
  frontend.agent.md
  backend.agent.md
  database.agent.md
```

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/frank-mendez/nextjs-blog-cms.git
cd nextjs-blog-cms
```

### 2. Install dependencies

Use Node **24.21.0** (`.nvmrc`) and pnpm **10.29.3** (`packageManager` in
`package.json`). pnpm 10 is supported by Vercel and was verified against the
existing dependency graph; dependency upgrades remain separate in issue #62.

```bash
nvm install
nvm use
corepack enable
pnpm --version             # must print 10.29.3
pnpm install --frozen-lockfile
```

If Corepack is unavailable, install the pinned package manager with
`npm install --global pnpm@10.29.3`, then run the same pnpm commands.

See [dependency upgrade notes](docs/dependency-upgrade.md) for migrations, image host configuration, verification, and tracked compatibility blockers.

Commit `package.json` and `pnpm-lock.yaml` together when changing dependencies.
Use `pnpm add <package>` / `pnpm add -D <package>`; do not generate an npm lockfile.
CI installs pnpm from the manifest before enabling the pnpm cache and uses the
Node patch in `.nvmrc`. Required peers are checked strictly without blanket bypasses.

Dependency build scripts are reviewed in `pnpm-workspace.yaml`: only
`unrs-resolver` is allowed to bootstrap/check its native resolver; `msw`'s optional
browser-worker copy script is ignored because no worker directory is configured.
Review new scripts before adding an approval; do not enable all dependency scripts.
The root `prepare` script installs Husky hooks normally.

For Vercel, set the project Node runtime to **24.x** and enable
`ENABLE_EXPERIMENTAL_COREPACK=1` in the project environment (Preview and
Production). `vercel.json` uses
`corepack pnpm` for frozen installation and build, so Corepack reads the exact
manifest pin instead of relying on Vercel's default pnpm version. The committed
pnpm lockfile also provides package-manager detection. Vercel manages the Node
24 patch; local development and CI pin `.nvmrc`. See [Vercel package managers](https://vercel.com/docs/package-managers).
Historical plans under `docs/superpowers/` retain their original npm commands.

### 3. Set up environment variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
LLM_KEY_ENCRYPTION_SECRET=   # 32-character secret for AES-256-GCM key encryption

# Newsletter
RESEND_API_KEY=
RESEND_FROM_EMAIL=            # verified sender address, e.g. noreply@yourdomain.com
NEWSLETTER_DELAY_MINUTES=60   # delay between publish and send (default: 60)
WEBHOOK_SECRET=               # shared secret used to authenticate the /api/newsletter/send cron call
```

### 4. Set up the database

- Run `database/schema.sql` in the Supabase SQL editor, then run
  `supabase/migrations/20261007055822_post_slug_routes.sql` to install URL reservations and redirects
- Apply RLS policies from `database/policies/`
- Optionally seed with `database/seed.sql`

### 5. Run the app

```bash
pnpm run dev
```

---

## Roles and Permissions

| Role   | Access                                          |
| ------ | ----------------------------------------------- |
| Admin  | Full control (users, posts, roles, comments, developer settings) |
| Author | Create and manage own posts, delete own comments |

Enforced using Supabase Row Level Security (RLS).

---

## AI Writing Assistant

The AI assistant allows authors to upload a PDF book, chat with it using their preferred LLM, and generate a full blog post draft from the conversation.

**Supported providers:** Claude (Anthropic), Gemini (Google), OpenAI

**How it works:**

1. Navigate to **Dashboard → AI Assistant**
2. Add your LLM API key under **Dashboard → Developer → LLM Providers**
3. Start a new chat — upload a PDF and select a model
4. Chat with the book, then click **Generate Post** to create a draft

PDF text is extracted on upload and stored as plain text. The LLM receives the extracted text as context. API keys are encrypted with AES-256-GCM and never stored in plaintext.

---

## Developer API

Admins can generate API keys to allow external tools to create posts without a browser session.

### Access Developer Settings

1. Log in as Admin
2. Go to **Dashboard → Developer**
3. Click **Generate New Key**, name it, and copy the key — shown only once

### API Key Format

Keys are prefixed with `fmblog_` followed by 64 hex characters. Only a SHA-256 hash is stored in the database.

### Endpoints

#### POST /api/posts/create

Create a new post from any HTTP client.

**Headers:**
```
Authorization: Bearer fmblog_your_key_here
Content-Type: application/json
```

**Body:**

| Field              | Type                   | Required | Description                                            |
| ------------------ | ---------------------- | -------- | ------------------------------------------------------ |
| `title`            | string                 | Yes      | Post title                                             |
| `content`          | string                 | Yes      | HTML content (TipTap-compatible)                       |
| `slug`             | string                 | No       | Custom URL slug; normalized server-side. Omit for automatic generation. |
| `status`           | `draft` \| `published` | No       | Defaults to `draft`                                    |
| `excerpt`          | string                 | No       | Plain-text summary                                     |
| `meta_title`       | string                 | No       | SEO title — defaults to `title`                        |
| `meta_description` | string                 | No       | SEO description — defaults to `excerpt`                |
| `tags`             | string[]               | No       | Tag names — created automatically if they don't exist  |
| `category`         | string                 | No       | Category name — matched by name or slug                |
| `image_url`        | string                 | No       | Featured image URL                                     |

**Example:**
```bash
curl -X POST https://your-domain.com/api/posts/create \
  -H "Authorization: Bearer fmblog_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Hello from n8n",
    "content": "<p>This post was created via the API.</p>",
    "status": "draft",
    "tags": ["automation", "n8n"],
    "category": "Technology"
  }'
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Hello from n8n",
    "slug": "hello-from-n8n",
    "status": "draft"
  }
}
```

#### POST /api/ai-assistant/generate

Generate a blog post headlessly using the AI assistant.

**Headers:**
```
Authorization: Bearer fmblog_your_key_here
Content-Type: application/json
```

#### GET /api/posts

List posts with pagination and filters.

#### GET /api/posts/[id]

Retrieve a single post by ID.

#### PATCH /api/posts/[id]

Update a post by ID.

#### DELETE /api/posts/[id]

Delete a post by ID.

### Security Notes

- Raw API keys are never stored — only SHA-256 hashes
- The key is shown exactly once after generation
- Keys can be revoked or deleted at any time from Developer Settings
- `author_id` is always set to the user who owns the API key
- API routes are rate-limited in-memory

---

## Newsletter

Readers subscribe via a widget at the bottom of every blog post. When a post is published, a send is queued in the `newsletter_sends` table and dispatched after a configurable delay.

### How it works

1. Reader submits their email on any blog post — stored in `newsletter_subscriptions`
2. When a post is published, a row is inserted into `newsletter_sends` with `scheduled_at = now() + NEWSLETTER_DELAY_MINUTES`
3. A Vercel Cron Job (or any HTTP scheduler) calls `POST /api/newsletter/send` every minute
4. The endpoint claims pending sends past their `scheduled_at`, emails all active subscribers via Resend, and marks the send as `sent`

### Publishing, cancellation, and retries

The post editor shows whether publishing will notify active subscribers, the configured delay (60 minutes by default), and the current notification status. **Refresh status** reads the latest queue state. The delay is the earliest eligible send time; actual delivery starts on a later dispatcher run.

`NEWSLETTER_DELAY_MINUTES` accepts a non-negative integer number of minutes. Missing, empty, negative, fractional, or malformed values fall back to 60; suffixes such as `30m` are not accepted.

Unpublishing cancels pending or in-progress notifications while retaining their queue row. The dispatcher checks publication and queue status before each batch of up to 10 recipients. Emails already handed off cannot be recalled; withdrawing publication stops later batches.

Republishing an undelivered notification restores the same row with a fresh delay, including pending or preparing rows left behind by a failed cancellation. Ordinary scheduling retries preserve an existing pending deadline. A dispatcher claim (`sending_started_at`) means preparation; `delivery_started_at` is persisted immediately before the first provider attempt. Failures before that handoff remain retryable. Notifications with possible provider handoff, partial failures, or completed delivery are never restarted. Each claim owns a `dispatch_token`; restore and recovery revoke it so an old worker cannot send or overwrite a newer claim.

Publication remains successful if newsletter scheduling fails. The editor shows a separate warning and offers **Retry newsletter scheduling** only for published posts with a missing notification or a failed notification without provider handoff. The server checks ownership, publication readiness, and queue state again; retries do not save unsaved editor input. Queue read failures block retries until status can be read. The dispatcher releases unprocessed claims on errors; stale preparation is recovered after ten minutes without replaying possible deliveries. REST create/update responses also include `newsletter_warning` when scheduling or cancellation cannot be confirmed, while preserving the successful post response. Provider-returned errors mark delivery as failed rather than sent.

Upgrade: pause the newsletter dispatcher, apply `20261007121102_newsletter_delivery_handoff.sql`, deploy the updated application, then resume dispatch. Historical claim timestamps are backfilled as possible handoff because prior deliveries cannot be determined safely.

Verification: Vitest executes the scheduling and dispatch implementation with isolated recipients and a mocked provider. Playwright verifies real application/database writes, including pre-handoff failure recovery. `database/tests/newsletter_queue.sql` checks PostgreSQL constraints and conditional-update semantics with rolled-back fixtures; it does not execute TypeScript or detect application query drift. Run it only against an isolated migrated database.

### Unsubscribe

Every email contains a unique unsubscribe link: `GET /api/newsletter/unsubscribe?token=<token>`. Clicking it sets `unsubscribed_at` and redirects to `/newsletter/unsubscribed`.

### Admin dashboard

Go to **Dashboard → Admin → Newsletter** (admin only) to see:

- Active subscribers, sends dispatched, and unsubscribed counts
- Pending and in-progress scheduled sends
- Recent subscriber list with status badges
- CSV export of all subscribers

### Vercel Cron setup

A `vercel.json` is included at the repo root that configures the cron to fire every minute. The endpoint requires a `x-webhook-secret` header matching `WEBHOOK_SECRET` — add this to your Vercel project environment variables. Vercel Cron sends the header automatically when the secret is configured in the project settings.

---

## Password recovery
The login page links to `/forgot-password`. Requests use Supabase Auth and always
show the same confirmation for registered and unregistered email addresses.
Passwords must contain at least eight characters, matching registration and
account settings. The signup server action enforces this policy even when browser
validation is bypassed. Login still accepts older six-character passwords.
Additional Supabase password rules are enforced by Auth and reported during recovery.

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
   Keep the existing signup `/auth/callback` redirects allowed as well.
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
against the dedicated disposable test environment described above. Set
`E2E_MAILPIT_URL` to its Mailpit origin (for example `http://127.0.0.1:54324`). The
browser test requests a real email, follows its actual link in a fresh browser,
checks validation, changes the password, verifies new-password sign-in and
old-password rejection, and verifies that the same link cannot be reused.

---

## Public author profiles

Public article bylines and avatars link to `/authors/<profile UUID>`. Profiles show the author's public name, avatar, biography and website/social links, followed by their published articles, newest first, with 12 articles per page. Authors manage this information in **Dashboard → Profile**.

The `public_author_profiles` view intentionally executes with its owner's privileges so anonymous readers can access the explicitly listed public fields despite private-profile RLS. Supabase Security Advisor's `security_definer_view` finding is expected for this view. Do not switch it to `security_invoker = true`: anonymous author lookups and bylines would lose access. Keep its projection limited to public fields and retain the privacy assertions when changing it.

Apply `20261006160738_public_author_profiles.sql` before deploying this feature. Public post and comment author queries use the `public_author_profiles` view, which deliberately exposes only public fields. Direct private-profile reads are limited to the signed-in owner; administrative account operations use the server-only service client. Anonymous profile-table reads return no rows, and clients cannot change account roles or email addresses through profile updates.

Database privacy assertions run against the disposable Supabase stack in CI and roll back their fixtures. To run them locally against a migrated disposable database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/public_author_profiles.sql
```

## Testing

### Unit Tests (Vitest)

Covers lib utilities, API routes, services, and UI components with 80%+ thresholds across lines, branches, functions, and statements.

```bash
pnpm run typecheck         # route types and full TypeScript check
pnpm test                  # watch mode
pnpm run test:run          # single run
pnpm run test:coverage     # coverage report
```

### End-to-End Tests (Playwright)

The suite verifies 19 posts REST API cases and five browser flows: public navigation/newsletter/registration validation, editor save and publish, profile updates, PDF upload/chat, and MFA enrollment/login. Provider generation is stubbed; auth, PDF parsing, and database writes use the real local services.

Use a **dedicated disposable Supabase test project**, never production. Apply all `supabase/migrations` or start the local stack with `pnpm dlx supabase@2.119.0 start`. Put its `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the ignored `.env.e2e` file. The Playwright server inherits those values. Set `RESEND_API_KEY` and `SLACK_WEBHOOK_URL` to empty values in that file to keep local verification isolated from external integrations.

```bash
pnpm exec playwright install chromium
pnpm run test:e2e                       # API and browser suites
pnpm run test:e2e --project=api          # HTTP tests only
pnpm run test:e2e --project=browser      # browser tests only
pnpm run test:e2e:report                # open the HTML report
```

Playwright starts its own server by default. Set `E2E_BASE_URL` for a different port; `E2E_REUSE_SERVER=1` explicitly reuses an existing local server configured for the same test database. Global setup seeds a disposable author, API key, and posts; teardown removes that user's rows and auth account. The newsletter smoke test removes its own subscription.

---

## Deployment

1. Import repo to Vercel
2. Add environment variables
3. Assign a domain (e.g. `blog.yourdomain.com`)

---

## AI Development Workflow

This project is designed to work seamlessly with Claude Code:

- Modular, feature-based architecture for safe refactoring
- Dedicated `agents/` instruction files
- MCP servers for full-stack automation

---

## Screenshots

**Public Blog — SEO-friendly article listing**

![Public Blog](public/screenshots/public-blog.png)

**AI Assistant — Chat with books and generate blog posts**

![AI Assistant](public/screenshots/ai-assistant.png)

**Developer Settings — API Key Management and LLM Providers**

![Developer Settings](public/screenshots/developer-settings.png)

---

## Roadmap

- [x] Comments system
- [x] Developer API with API key management
- [x] AI Writing Assistant (Claude, Gemini, OpenAI)
- [x] PDF text extraction and LLM context
- [x] REST API for posts
- [x] Newsletter subscriptions with auto-send on publish
- [ ] Analytics dashboard
- [ ] Scheduled posts
- [ ] Multi-author collaboration
- [ ] Headless CMS API

---

## Contributing

Contributions are welcome. To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes with clear messages
4. Open a Pull Request — describe what changed and why

For significant changes, open an issue first to discuss the approach.

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you agree to uphold a respectful and inclusive environment. Report unacceptable behavior to the project maintainer.

---

## License

[MIT](LICENSE)

---

## Author

Frank Mendez

## Publication readiness and editorial review

Drafts may have empty titles, bodies or excerpts. A draft becomes public only after
server validation succeeds. Published edits validate the complete resulting article
before changing any live fields or tags; rejected requests preserve the previous
publication and do not queue newsletter emails. The dashboard retains unsaved input
and displays actionable field errors. Its post-list publish action opens the editor
for review instead of publishing immediately.

The shared policy in `features/posts/publication.ts` requires:

- A descriptive title of **10–160 readable characters**.
- A unique slug, up to **200 characters**, using lowercase letters, numbers and
  single hyphen separators. Empty draft slugs are generated automatically.
- At least **200 readable body words**, with practical examples and useful takeaways.
  HTML markup, comments, scripts, styles, TipTap JSON node names/attributes, empty blocks and whitespace entities do
  not count. Inline markup does not conceal placeholder phrases.
- An accurate excerpt of **40–500 readable characters** and an existing author
  whose profile has a non-empty display name.
- No obvious test titles, lorem ipsum, unfinished template instructions or
  placeholder cover or inline images. Articles about testing are welcome: the word “test”
  alone is never grounds for rejection.
- Explicit human editorial review of accuracy, usefulness, attribution, relevant
  taxonomy and consistent SEO metadata. The editor clears the confirmation when
  content changes. Ambiguous flags such as `TODO`, `TBD` or “work in progress” stay
  visible as non-blocking warnings before and after confirmation so a human can review their context. Obvious filler still must be removed.

These thresholds are minimum readiness checks, not measures of accuracy or quality.
An editor must assess originality, sources, appropriate examples, category/tags and
assets before confirming review. SEO title/description may use the site's title and
excerpt fallbacks; editors must check their rendered meaning.

REST `POST /api/posts/create` and `PATCH /api/posts/{id}` require
`"editorial_reviewed": true` when the resulting article is published, including
PATCH requests that omit `status` while editing a published article. This is an
attestation by a human reviewer, not permission for an AI pipeline to assert review
automatically. AI generation routes continue to create drafts and must go through
the same publishing checks. There is currently no scheduled article-publication
flow; any future flow must reuse `validatePublication` and require prior human
review. Newsletter scheduling and dispatch independently check readiness and current
publication state.

Publication errors return HTTP 422 with the following shape (no article or taxonomy
writes occur on validation failure):

```json
{
  "success": false,
  "error": "Publication blocked",
  "details": {
    "field_errors": {
      "content": ["Write at least 200 readable words; this article has 0. Include practical examples and useful takeaways."],
      "editorial_reviewed": ["A human editor must confirm accuracy, usefulness, attribution, taxonomy and SEO metadata before publishing."]
    }
  }
}
```

Publication writes compare the fetched post's timestamp and status to prevent a
concurrent change between validation and saving from bypassing checks. Reload and
review again after a conflict. Published edits do not requeue newsletters. Unpublishing
marks pending/claimed notifications failed; the sender also refuses missing, draft
or unready articles. Dispatch rechecks publication state and queue cancellation between batches. Reviewed live edits preserve the validated email snapshot for the remaining recipients. Canceled sends can be rescheduled on republish if no provider handoff occurred; sent or potentially partial sends retain deduplication. An email already handed to the provider cannot be recalled.

Public cache invalidation covers the root layout (home, blog, author and taxonomy
pages), affected old/new article URLs and the sitemap. Changing a slug is deliberate;
the editor locks published URLs until you choose **Change published URL** and
confirm the permanent redirect. REST PATCH requests that change a published slug
must include `confirm_slug_change: true` as well as `editorial_reviewed: true`.
Former published URLs return **308** and resolve directly to the current published
URL. They remain reserved through unpublish/republish; unpublished destinations
return 404, and deleting a post removes its reservations. Title edits and clearing
an existing slug preserve the saved URL.

Slugs are normalized server-side to lowercase letters, numbers and single hyphens,
with a 200-character limit. Automatic new-post slugs follow the title until manually
edited and retry actual unique-constraint conflicts up to 20 times (`-2`, `-3`, …).
Titles with no usable slug characters receive a `draft-<UUID>` fallback. Custom slug
conflicts preserve input and return an actionable `slug` field error (HTTP 409 for
write conflicts); a chosen URL is never silently suffixed.

Apply `supabase/migrations/20261007055822_post_slug_routes.sql` **before deploying**
this code. It backfills current URL reservations without rewriting existing URLs.
Historical URL changes made before this migration cannot be reconstructed.
Reservations and post writes commit together, so a failed reservation leaves the
post unchanged. The route table has read-only public access for published posts;
only the database trigger maintains it.

Verify the database behavior, including concurrent creates and URL hijacking,
with `bash database/tests/verify-slug-routes.sh` (isolated local PostgreSQL). The
browser flow is covered by `e2e/browser/slug-safety.spec.ts` on a dedicated test
Supabase project.

### Test content and production cleanup

Keep test/seed posts in local or dedicated disposable test projects. Global E2E
setup/teardown reject the known production project. Remote test projects additionally
require `E2E_SUPABASE_PROJECT_REF` matching their Supabase hostname; local stacks are
allowed without it. Never configure E2E credentials for production. AI outputs and
work-in-progress articles belong in drafts until reviewed.

On **October 7, 2026**, a read-only production audit found that
`/blog/hello-this-is-for-test` already returned 404, was absent from the sitemap and
had no surviving post or associated newsletter queue row. All **42** sitemap article
URLs returned 200; an article-body scan found no obvious filler/template phrases.
The database audit also found no published posts matching the obvious test-title or
filler patterns. No production content was changed during this implementation.
This audit detects obvious placeholders and does not replace human quality review.

For future cleanup, use the checked dashboard/API to unpublish unsuitable articles,
then inspect `newsletter_sends` for pending or claimed notifications before allowing
mail dispatch. Verify the old URL, home/blog navigation, relevant tag/category pages
and sitemap in production after deployment. When there is no reviewed replacement,
leave the old URL at 404 rather than publishing filler to fill the gap.

### Atomic post saves and creation retries

Apply `20261007110518_atomic_post_mutations.sql` before deploying the application changes. Dashboard, REST, and AI saves use the server-only `save_post_atomic` RPC: post fields, tag resolution/replacement, URL reservations, publication state, and the AI chat link commit together. A failed operation rolls back the entire save. Existing publication readiness validation runs before the RPC; browser roles cannot execute it. Newsletter scheduling and cache refresh occur after persistence succeeds.

REST creation supports opt-in `Idempotency-Key`. Reusing a key with the same parsed input returns the existing post with `Idempotent-Replayed: true` without scheduling another newsletter; changed input returns 409. Keyless requests create separate posts, preserving the existing API contract. AI generation uses a fresh key per successful UI attempt, retains it on failures for safe retry, and resets it when the chat/message snapshot changes. Keyless AI callers can regenerate freely. Receipts last until the post is deleted. Transient receipt lookup failures return 503; invalid REST tags return 422 with field errors. Dashboard recovery retains its existing document UUID and duplicate-draft warning. Updates retain optimistic concurrency checks; omitted REST tags preserve relationships and an empty array clears them.

Database rollback verification: run `psql -v ON_ERROR_STOP=1 -f database/tests/atomic_posts.sql` against an isolated migrated test database. The script rolls back all fixtures and injects tag insert/delete and AI-link failures. Do not run it against production.

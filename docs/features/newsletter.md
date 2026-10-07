# Newsletter

Readers subscribe via a widget at the bottom of every blog post. When a post is published, a send is queued in the `newsletter_sends` table and dispatched after a configurable delay.

## How it works

1. Reader submits their email on any blog post — stored in `newsletter_subscriptions`
2. When a post is published, a row is inserted into `newsletter_sends` with `scheduled_at = now() + NEWSLETTER_DELAY_MINUTES`
3. The daily Vercel Cron Job calls `GET /api/newsletter/send`; external schedulers may use authenticated POST
4. The endpoint claims pending sends past their `scheduled_at`, emails all active subscribers via Resend, and marks the send as `sent`

## Publishing, cancellation, and retries

The post editor shows whether publishing will notify active subscribers, the configured delay (60 minutes by default), and the current notification status. **Refresh status** reads the latest queue state. The delay is the earliest eligible send time; actual delivery starts on a later dispatcher run.

`NEWSLETTER_DELAY_MINUTES` accepts a non-negative integer number of minutes. Missing, empty, negative, fractional, or malformed values fall back to 60; suffixes such as `30m` are not accepted.

Unpublishing cancels pending or in-progress notifications while retaining their queue row. The dispatcher checks publication and queue status before each batch of up to 10 recipients. Emails already handed off cannot be recalled; withdrawing publication stops later batches.

Republishing an undelivered notification restores the same row with a fresh delay, including pending or preparing rows left behind by a failed cancellation. Ordinary scheduling retries preserve an existing pending deadline. A dispatcher claim (`sending_started_at`) means preparation; `delivery_started_at` is persisted immediately before the first provider attempt. Failures before that handoff remain retryable. Notifications with possible provider handoff, partial failures, or completed delivery are never restarted. Each claim owns a `dispatch_token`; restore and recovery revoke it so an old worker cannot send or overwrite a newer claim.

Publication remains successful if newsletter scheduling fails. The editor shows a separate warning and offers **Retry newsletter scheduling** only for published posts with a missing notification or a failed notification without provider handoff. The server checks ownership, publication readiness, and queue state again; retries do not save unsaved editor input. Queue read failures block retries until status can be read. The dispatcher releases unprocessed claims on errors; stale preparation is recovered after ten minutes without replaying possible deliveries. REST create/update responses also include `newsletter_warning` when scheduling or cancellation cannot be confirmed, while preserving the successful post response. Provider-returned errors mark delivery as failed rather than sent.

Upgrade: pause the newsletter dispatcher, apply `20261007121102_newsletter_delivery_handoff.sql`, deploy the updated application, then resume dispatch. Historical claim timestamps are backfilled as possible handoff because prior deliveries cannot be determined safely.

Verification: Vitest executes the scheduling and dispatch implementation with isolated recipients and a mocked provider. Playwright verifies real application/database writes, including pre-handoff failure recovery. `database/tests/newsletter_queue.sql` checks PostgreSQL constraints and conditional-update semantics with rolled-back fixtures; it does not execute TypeScript or detect application query drift. Run it only against an isolated migrated database.

## Unsubscribe

Every email contains a unique unsubscribe link: `GET /api/newsletter/unsubscribe?token=<token>`. Clicking it sets `unsubscribed_at` and redirects to `/newsletter/unsubscribed`.

## Admin dashboard

Go to **Dashboard → Admin → Newsletter** (admin only) to see:

- Active subscribers, sends dispatched, and unsubscribed counts
- Pending and in-progress scheduled sends
- Recent subscriber list with status badges
- CSV export of all subscribers

## Vercel Cron setup

`vercel.json` configures `/api/newsletter/send` daily at `09:00 UTC` (`17:00` in Manila; Hobby may invoke anywhere within `17:00–17:59`). Vercel invokes production cron jobs using GET. Set a strong random `CRON_SECRET` in the Vercel project's **Production** environment; Vercel sends it as `Authorization: Bearer <CRON_SECRET>`, which the GET handler validates before accessing the queue. Redeploy production after changing environment variables. Do not put secrets in `vercel.json` or public environment variables.

The daily schedule is compatible with Vercel Hobby. `NEWSLETTER_DELAY_MINUTES` (default `60`) determines the earliest eligible delivery time, not the cron frequency: each invocation selects at most **10 due post notifications** (not ten recipients), so a larger backlog requires additional daily runs. A due notification is eligible for the next run but is not guaranteed delivery during that run. Failed delivery attempts also require investigation. For frequent dispatch on a plan that supports it, change the schedule to `*/5 * * * *` and redeploy. See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Also configure `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (a verified sender), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` for production. Check **Settings → Cron Jobs** for the registered job and its invocation logs; check Resend for provider errors. Supabase stores queue/subscriber data and does not trigger this job.

External schedulers may still POST to the endpoint with `x-webhook-secret` matching `WEBHOOK_SECRET`. GET requires `CRON_SECRET` and does not accept that webhook header. Triggering either authenticated endpoint processes due notifications and may send real emails.

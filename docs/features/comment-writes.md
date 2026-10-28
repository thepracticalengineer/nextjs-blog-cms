# Comment write protection

Issue #157 protects comment creation at the database boundary. Signed-in readers,
authors and admins share the same rules; verified MFA factors require AAL2.
Only published articles accept new comments. There is currently no reply or comment
edit path. Any future reply feature must use this same account budget and request
receipt contract before it is enabled.

## Limits and retries

Each account may create **5 comments per 60 seconds** and **30 per hour**, across
all articles, tabs and application instances. These are fixed windows starting at
the account's first successful write after each previous window expires. These
are not rolling limits: unused capacity at the end of one window can be followed
by a fresh budget at the start of the next (for example, four comments at second
59 and five at second 60 after an initial comment at second 0). The
limits are independent: exhausting either blocks a new comment until both allow
it. The database returns `COMMENT_RATE_LIMIT` with seconds until retry in the
error detail; the action returns safe text and `retryAfterSeconds`. The form
disables submission until that delay expires, retains the request ID, and keeps
the draft editable. Failed writes, validation failures and acknowledged retries consume no budget. Deletion does not
refund it. Deletion remains available under existing own/admin and MFA rules so
readers can remove their content even when they cannot post again.

[Comment reactions](comment-reactions.md) retain their separate database-enforced
30 state changes per minute per account. Desired-state set/remove is idempotent;
no-op retries do not consume budget. Direct reaction table writes remain revoked.

## Submission identity and content

`public.create_comment(p_post_id uuid, p_content text, p_request_id uuid)` is the
only untrusted create path. It obtains the author from `auth.uid()` and verifies
profile existence, MFA and publication. Direct comment inserts, upserts and
updates through REST/GraphQL or an authenticated SQL role are denied. Untrusted
roles retain only SELECT and authenticated DELETE grants; TRUNCATE and TRIGGER
grants are removed as well. The server
uses the user's session, never a service-role client. Trusted service-role imports
are outside the user rate-limit boundary; they must still satisfy the content
constraint and must never be exposed as a public write path.

The form creates a UUID when submitting and reuses it after returned or thrown
failures while the normalized text is unchanged. It retains the draft and displays
an inline error, prevents concurrent submissions and makes the field read-only
while pending. Success clears the draft and ID; intentional identical text then
gets a fresh ID. Editing the normalized text starts a new operation. This state
lasts for the mounted form; navigating away or reloading discards it. API clients
must retain their request IDs across ambiguous network failures and retries.

The database serializes creates per account, binds each request ID to the article
and a SHA-256 hash of normalized text, and returns the original comment ID on
replay. Reusing the ID with a different article or text returns
`COMMENT_REQUEST_CONFLICT`. IDs are scoped to the authenticated account. Minimal
private receipts survive comment or article deletion indefinitely, so late retries
acknowledge the original operation without resurrecting removed content. Account
deletion removes receipts and budgets. Receipts store IDs, the hash and a creation
timestamp, not comment text; neither receipts nor budgets are readable by
public/authenticated clients. The timestamp supports diagnostics and any separately
reviewed future retention policy. No automatic expiry is enabled, since deleting
receipts would weaken the delayed-retry guarantee.

UI, action and database normalize CRLF and CR line endings to LF, trim ECMAScript
leading/trailing whitespace (including non-breaking spaces and BOM), and enforce
**1–2,000 Unicode code points**. Internal whitespace is preserved; no NFC/NFKC
rewriting occurs. Emoji may use several code points, so the displayed count is not
a grapheme count. Null bytes and malformed Unicode cannot be stored. Whitespace-only
text is rejected. The migration preserves historical comments unchanged and adds
a `NOT VALID` constraint that still checks all new/updated rows, including imports.

## Deployment and verification

Pause comment submissions, apply `20261028140526_protect_comment_writes.sql`, deploy
the matching application, then resume. The migration deliberately makes old direct
insert clients fail safely; there is no compatibility bypass. Do not restore direct
insert grants on application rollback. No new secret, background cleanup or external
service is required. A retry after moderation/deletion returns the original ID,
not the removed text, and does not reinsert the comment.

- Unit: `pnpm exec vitest run __tests__/features/comments/actions.test.ts __tests__/components/CommentForm.test.tsx`.
- Isolated desktop/mobile: `pnpm exec playwright test --config=e2e/comment-reactions.config.ts`.
- Disposable SQL: `database/tests/comment_writes.sql` plus `database/tests/comment_reactions.sql` with `psql -v ON_ERROR_STOP=1`.
- Disposable concurrency: `node database/tests/comment-writes-concurrency.mjs` and `node database/tests/comment-reactions-concurrency.mjs` (pinned to `supabase_db_nextjs-blog-cms`).
- Full-stack comment posting remains covered by `e2e/browser/comment-reactions.spec.ts` against a dedicated test project.

SQL checks cover unauthenticated/direct bypass attempts, MFA, private receipts,
normalization, payload conflicts, same-text/new-ID creation, cross-account isolation,
limits, retry guidance, deletion and recovery. Concurrent connections cover shared
cross-post limits, identical retries, hourly exhaustion and publication locking.
Browser fixtures exercise the real form with simulated action responses; they do
not establish hosted Auth or production Data API behavior. Never run these fixtures
against production; keep mail and webhooks disabled in full-stack test environments.

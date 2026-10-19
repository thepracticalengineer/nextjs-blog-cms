# Comment reactions

Signed-in participants can choose **👍 Like**, **❤️ Love**, **🎉 Celebrate**, or
**💡 Insightful** on a comment. Each person has one selection per comment. Choosing
another replaces it; choosing the selected control removes it. Guests see counts
and receive a sign-in link when choosing a reaction. Controls support keyboard,
screen-reader feedback and touch targets of at least 44 pixels.

## Authorization and privacy

Reactions require a verified session/profile and the same MFA assurance as other
private mutations. No author, publishing or dashboard permission is required or
granted. Existing signup role defaults remain unchanged; contributor approval is
tracked separately in [issue #111](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/111).

Only comments belonging to a currently published post are eligible, including for
the post's owner/admin. Unpublishing hides counts and disallows further mutations.
Deleting a comment, post or profile cascades the corresponding reaction rows.
The current comment system uses permanent deletion: there is no removed/tombstone
state to react to. [Issue #162](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/162)
must extend the eligibility predicate when it introduces retained tombstones.

`comment_reactions` has RLS enabled and no direct client read/write grants or
policies. The security-definer RPCs have an empty search path and narrow execute
grants. Reads return only per-type counts and the caller's selection, with no
reactor IDs or private profile fields. An enrolled AAL1 caller can read public
counts but receives no private selection and cannot write. Direct Data API calls
have the same constraints as server actions.

Reactions reference comment IDs, without separate parent/reply storage. The same
contract applies to direct replies once
[issue #158](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/158)
adds them to the comments table and renders their cards. This change does not
introduce reply creation or thread moderation.

## Retries, concurrency and limits

`set_comment_reaction(comment_id, desired_type)` sets an explicit selection;
`NULL` removes it. It never toggles on the server. Repeating a successful operation
is a no-op, so a lost-response retry cannot undo that operation or create a second
row. Distinct competing operations use the last committed selection; an intentional
later set can replace an earlier one. A retry is a new set of the same desired
state, rather than a permanently replayable historical operation receipt.

A per-user transaction lock serializes changes and a shared database budget allows
30 state changes per fixed one-minute window across all comments. No-op retries do
not consume budget. Budget rows contain only an account ID, window and count and
cascade on account deletion. Publication/comment share locks serialize mutations
with unpublication and deletion. The primary key enforces one row per comment/user.

The UI keeps authoritative counts while saving, prevents duplicate activation, and
uses the returned snapshot on success. After a failed or uncertain write it reads
current state and offers a retry of the original desired selection. Client waits
expire after 15 seconds; late responses cannot overwrite reconciled state. Identity
changes discard old pending UI and private selections. Counts refresh on focus,
visibility changes and every 30 seconds while visible. Concurrent updates are
therefore eventually visible without a Realtime subscription.

The batch RPC matches the existing oldest-first public comment window, ordered by
`created_at, id` and capped at 1,000 comments. It bounds aggregation to those IDs,
so PostgREST's row cap cannot select unrelated snapshots. The single-comment
variant supports mutation responses without aggregating the whole discussion.
Full thread/reply pagination remains
[issue #161](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/161).

## Migration and verification

Apply `supabase/migrations/20261019140000_comment_reactions.sql` **before deploying**
the application. It adds reaction storage, private budgets, and the two RPCs; no
existing comments or roles change. No backfill or external provider is required.
Keep the public author projection unchanged.

- `pnpm exec vitest run __tests__/features/comments` tests runtime validation,
  authorization errors, read/write failures, pending/selected/guest states,
  account switches, uncertain writes, retry intent and refresh races.
- `pnpm exec playwright test --config=e2e/comment-reactions.config.ts` renders the
  real controls/CSS on desktop and mobile with isolated HTTP action fixtures. It
  verifies add/change/remove, fixture persistence on reload, guest guidance,
  keyboard feedback, narrow layouts and recovery. It does not exercise Next.js
  server actions or live Auth.
- `database/tests/comment_reactions.sql` runs rolled-back assertions on a migrated
  disposable database for counts, selections, privacy, direct-write denial,
  eligibility, MFA, retries, budgets and cascades.
- `node database/tests/comment-reactions-concurrency.mjs` uses independent
  connections to the designated local `supabase_db_nextjs-blog-cms` container for
  duplicate retries, competing selections, 12-reader totals, removals and
  concurrent unpublication, then removes its fixtures.
- `pnpm exec playwright test e2e/browser/comment-reactions.spec.ts --project=browser`
  covers the public article, real server actions, persistence and guest counts
  using the dedicated migrated E2E stack. Follow the [testing setup](../development/testing.md)
  and disable external mail/webhooks. Never use production.

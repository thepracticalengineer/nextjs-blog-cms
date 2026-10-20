# Article reactions

Published article pages offer **Add reaction**, a compact picker and a total count
(including zero). Readers may independently select **💖 Love**, **🦄 Unicorn**,
**🤯 Mind blown**, **🙌 Celebrate**, and **🔥 Fire**. Selecting a chosen type removes
it without changing the other types. The aggregate counts reactions, not unique
readers: one reader can contribute up to five.

Guests can inspect counts and the picker. Choosing a type opens **Log in to
continue**, with Log in, Create account and Close. No write or count change occurs.
The modal traps focus, supports Escape and restores focus to the chosen reaction
when dismissed; the reader stays on the article. Authentication links preserve the
article URL and reactions anchor. A reader must choose again after authentication;
the site never automatically saves the guest's attempted reaction. Picker arrow
keys move among named toggle buttons; Enter/Space select them and Escape dismisses
the picker. Controls expose pressed state and have at least 44-pixel touch targets.

## Persistence, concurrency and failures

Article reactions use separate storage from [comment reactions](comment-reactions.md).
The primary key is `(post_id, user_id, reaction)`. The mutation RPC
`set_article_reaction(post_id, reaction, selected)` sets an explicit desired state
for a single type. Repeating a set/remove does nothing, preventing duplicate rows
and accidental toggles after a lost response. Competing calls for the same type
use the latest committed state. Retrying is a new request to set that desired
state, not a replay of a permanently stored operation receipt.

Counts and selections update from the successful server snapshot. Writes are
serialized in each mounted control and disable selection while pending. Failed or
uncertain writes trigger reconciliation and offer a retry of the original desired
state where retryable; permanent authorization/input/unavailable errors do not.
Errors and recovery controls appear inside the open picker, and on the article
when the picker is closed, so the popup cannot cover the retry/refresh buttons.
Requests expire in the UI after 15 seconds; late responses cannot overwrite newer
state. Identity changes discard pending UI/private selections. Background reads
bypass Next's action queue, coalesce focus/visibility events, and refresh every
30 seconds while visible. Concurrent counts are eventually refreshed, without a
Realtime subscription. A read failure shows an error and Refresh reactions;
unknown counts are never presented as an authoritative zero.

## Authorization and lifecycle

Both server actions and database RPCs enforce the existing session/profile and MFA
requirements; reacting grants no dashboard/publishing permissions. RLS is enabled,
with direct client table access revoked and no permissive policies. Narrow
security-definer RPCs use an empty search path. The aggregate RPC returns only
per-type counts and the caller's selections, never reactor IDs or private profile
fields. Enrolled AAL1 readers see public counts without selections and cannot write.
The public author projection is unchanged.

Only currently published articles are eligible, including for owners/admins.
Unpublishing hides counts and rejects changes; republishing restores stored
reactions. Post share locks serialize writes with unpublication/deletion. Deleting
an article or profile cascades its reactions. A private per-user budget permits
30 actual changes per fixed one-minute window across articles; no-op retries do
not consume budget. Budget rows cascade on account deletion. Comment reactions,
notifications, ranking and analytics are outside this feature.

## Migration and verification

Apply `supabase/migrations/20261020070000_article_reactions.sql` **before deploying
the application**. It adds article storage, private budgets and two RPCs. No
backfill, external integration, role change or new dependency is required.

- `pnpm exec vitest run __tests__/features/article-reactions` verifies validation,
  authorization boundaries, independent selections, totals, guests, duplicate
  activation, failures/retries, stale responses and identity changes.
- `database/tests/article_reactions.sql` contains rolled-back assertions for
  public/own-state reads, direct access denial, MFA, eligibility, retries, budgets,
  lifecycle and privacy. Run only against a migrated disposable database.
- `node database/tests/article-reactions-concurrency.mjs` uses the designated local
  `supabase_db_nextjs-blog-cms` container, exercises concurrent retries/types,
  12-reader totals, competing writes, removal and unpublication, then removes its
  fixtures.
- `pnpm exec playwright test --config=e2e/article-reactions.config.ts` exercises the
  real UI/CSS on desktop and mobile with HTTP action/read fixtures: independent
  types, reload persistence, guest modal focus/links/Escape/close, keyboard, touch
  sizes, narrow layout and lost-response recovery. It does not verify live Auth or
  Next server actions.
- `pnpm exec playwright test e2e/browser/article-reactions.spec.ts --project=browser`
  verifies the real public article, server actions, browser RPCs, login, reload
  persistence, guest counts/modal and removal against the dedicated migrated E2E
  stack. Follow [testing setup](../development/testing.md), disable external
  mail/webhooks and never use production.

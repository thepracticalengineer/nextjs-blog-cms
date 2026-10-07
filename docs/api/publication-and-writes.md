# Publication and write contracts

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

## Atomic post saves and creation retries

Apply `20261007110518_atomic_post_mutations.sql` before deploying the application changes. Dashboard, REST, and AI saves use the server-only `save_post_atomic` RPC: post fields, tag resolution/replacement, URL reservations, publication state, and the AI chat link commit together. A failed operation rolls back the entire save. Existing publication readiness validation runs before the RPC; browser roles cannot execute it. Newsletter scheduling and cache refresh occur after persistence succeeds.

REST creation supports opt-in `Idempotency-Key`. Reusing a key with the same parsed input returns the existing post with `Idempotent-Replayed: true` without scheduling another newsletter; changed input returns 409. Keyless requests create separate posts, preserving the existing API contract. AI generation uses a fresh key per successful UI attempt, retains it on failures for safe retry, and resets it when the chat/message snapshot changes. Keyless AI callers can regenerate freely. Receipts last until the post is deleted. Transient receipt lookup failures return 503; invalid REST tags return 422 with field errors. Dashboard recovery retains its existing document UUID and duplicate-draft warning. Updates retain optimistic concurrency checks; omitted REST tags preserve relationships and an empty array clears them.

Database rollback verification: run `psql -v ON_ERROR_STOP=1 -f database/tests/atomic_posts.sql` against an isolated migrated test database. The script rolls back all fixtures and injects tag insert/delete and AI-link failures. Do not run it against production.

See [publication readiness and slugs](../features/publication-and-slugs.md) for validation requirements and URL behavior. Published REST requests require `editorial_reviewed: true`; published slug changes also require `confirm_slug_change: true`.

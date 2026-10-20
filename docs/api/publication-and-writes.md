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

Apply `20261007110518_atomic_post_mutations.sql` before deploying application changes. Dashboard saves use the server-only `save_post_atomic` RPC: post fields, tag resolution/replacement, URL reservations and publication state commit together. A failed operation rolls back the entire save. Publication readiness validation runs before the RPC; browser roles cannot execute it. Newsletter scheduling and cache refresh occur after persistence succeeds.

Dashboard recovery retains its document UUID and duplicate-draft warning. Updates retain optimistic concurrency checks. Existing idempotency receipts and legacy AI provenance remain in place; internal atomic save and idempotency contracts are preserved. The external REST creation/idempotency and AI generation entry points are retired: their requests now return `410 API_RETIRED` without saving or replaying a successful response. See [Developer API retirement](developer-api.md).

Database rollback verification: run `psql -v ON_ERROR_STOP=1 -f database/tests/atomic_posts.sql` against an isolated migrated test database. The script rolls back all fixtures and injects tag insert/delete and AI-link failures. Do not run it against production.

See [publication readiness and slugs](../features/publication-and-slugs.md) for validation requirements and URL behavior. Internal publication still requires explicit human editorial confirmation and deliberate confirmation of published slug changes.

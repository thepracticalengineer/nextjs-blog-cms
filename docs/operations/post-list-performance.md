# Post list performance and issue #77 verification

Verified locally on October 12, 2026 against `main` at `de5bc25` and the issue #77
implementation. No production database, publication or newsletter delivery was used.

## Behavior

Dashboard lists use the authenticated `get_dashboard_posts` RPC. It returns one
bounded page, exact filtered count, clamped page number and complete category facets
in one database snapshot. It is `SECURITY INVOKER`, explicitly scopes authors to
their own posts, and allows admins to view all accessible posts. It does not read or
return bodies. Search treats `%`, `_`, `*`, parentheses and punctuation literally;
sorts are allowlisted and use an ID tie-breaker. URL state survives reload/Back.

Public lists select `PUBLIC_POST_SELECT`, including stored `reading_time_minutes`.
Category and tag lists now paginate; tag filtering uses a separate inner relationship
so matching one tag does not remove other tags from the summary. Reading time is a
stored generated column, computed for existing content by the migration and for
subsequent writes by Postgres. JSON text that cannot be represented as `jsonb`
(including escaped NUL characters and out-of-range numbers) uses the plain-text
fallback so reading-time calculation does not reject those saves or backfills.
Unicode whitespace is normalized before counting. The public author projection and existing RLS policies
remain unchanged.

Publication refresh is centralized in `features/posts/cache.ts`. It invalidates
home, the blog layout, author pages, sitemap and explicit old/new article paths.
The blog layout intentionally covers taxonomy and historical redirect URLs without
additional relationship reads. This is broader than individual taxonomy paths but
no longer flushes the root layout or unrelated dashboard/settings routes. AI paths
remain draft-only and refresh the dashboard.

Production testing found that previously unseen article URLs could return 500 on
both the baseline and initial implementation (`DYNAMIC_SERVER_USAGE`): empty
build-time static params conflicted with cookie-dependent rendering. Article,
category and tag routes now explicitly render dynamically and no longer enumerate
build-time params. Metadata and article reads use request-scoped React caching;
this is not a persistent cache or a measured claim of duplicate baseline queries.
These routes do not use ISR: every request reads Supabase, so deployed database
latency and traffic directly affect page cost. Path invalidation does not provide a
server response cache for these dynamic routes. A future cookie-free anonymous
read path could restore caching after verifying publication and redirect freshness.

## Reproducible benchmark

Use Node 24.21.0, pnpm 10.29.3 and a dedicated migrated test database. Configure
`.env.e2e` as described in [testing](../development/testing.md). The script applies
the same production-project refusal guard as E2E and cleans up its own fixtures.
Do not reuse credentials from the application's ordinary environment files.

```bash
node scripts/benchmark-post-lists.mjs
# Optional: start two production builds with the same isolated database,
# disable mail/webhooks, and supply their local URLs:
node scripts/benchmark-post-lists.mjs --before-url http://localhost:3076 --after-url http://localhost:3078
```

Recorded dataset: 1,500 synthetic posts (1,499 published), one author, one category,
one tag per post, 11,831-byte HTML bodies. Seven measured samples follow one warmup
per query/flow. Public-query measurements use an anonymous client; dashboard queries
use the author. Both app builds and both query shapes use the migrated database,
so this isolates application/query changes rather than measuring migration/index
installation cost. Baseline dashboard responses hit the configured 1,000-row cap;
the new response contains 10 summaries while the RPC counts all 1,500 posts.

| Measurement | Baseline | Updated |
| --- | ---: | ---: |
| Dashboard query median round trip | 109.89 ms | 8.33 ms |
| Dashboard query JSON | 12,933,101 bytes | 7,257 bytes |
| Public 10-post query median round trip | 4.28 ms | 3.78 ms |
| Public 10-post query JSON | 129,312 bytes | 8,283 bytes |
| Dashboard browser readiness median | 637.39 ms | 159.73 ms |
| Dashboard HTML, including serialized RSC props | 14,688,838 bytes | 62,534 bytes |
| Editor readiness median | 488.24 ms | 459.14 ms |
| REST publish completion median | 29.38 ms | 35.09 ms |

Payload sizes are uncompressed UTF-8 JSON/HTML. Query timings include local HTTP and
JSON decoding, not SQL execution alone. Browser readiness means the dashboard
pagination is visible, or the editor is visible and its Save Draft button is enabled
(including working-copy recovery). Publish timing measures the supported REST response,
including newsletter scheduling but not eventual email delivery. No subscribers or
external delivery providers were involved.

The dashboard payload reduction is 99.94%; public query payload reduction is 93.59%.
The editor ranges overlap (375–496 ms baseline, 361–505 ms updated), as do publish
ranges (27–67 ms baseline, 27–59 ms updated). These results do **not** establish an
editor or publish latency improvement. Publication validation and REST hydration now
overlap independent lookups, but localhost timings are dominated by other work and
variation. Profile deployed latency before further changes to recovery or handoff.

An initial public-query regression exposed a mismatch between `DESC NULLS LAST`
ordering and the new index's default null ordering. The final indexes match the
query ordering; an isolated `EXPLAIN (ANALYZE, BUFFERS)` confirmed an index scan for
the ordered public page. Indexes are not evidence that every filter/sort avoids a
scan: exact dashboard counts and literal substring filtering still scan accessible
summary rows, so significantly larger datasets should be profiled separately.

Related mobile issue #34 is already closed. The new browser test also checks the
390-pixel dashboard viewport for horizontal overflow. These local measurements are
not a new mobile Lighthouse score or production performance guarantee.

## Verification

- `database/tests/post_lists.sql`: reading-time generation/update behavior, empty/JSON/HTML
  inputs, 1,502 owned posts, pages beyond 1,000, counts/facets, literal search,
  category filters, title/author/status sorting, stable boundaries and RLS roles.
- Existing database privacy, atomicity, slug, working-copy, image and newsletter
  assertions run against a database rebuilt from the final migration sequence.
- `e2e/browser/post-lists.spec.ts`: 1,005 posts, URL controls, reload/Back, empty
  search state, taxonomy pagination and list HTML without body markers.
- `e2e/api/posts.publication-pages.spec.ts`: warms home/blog/article/category/tag/
  author/sitemap surfaces, then verifies REST create, edit, rename, taxonomy change,
  unpublish and delete against a production server after the build. CI runs this
  regression with `E2E_PRODUCTION=1`.
- Sixteen related REST/author-profile/slug checks passed against the production server.
- Existing publication-readiness browser coverage verifies dashboard review,
  validation failures, publish, unpublish and newsletter state transitions.
- All 1,027 unit tests passed; coverage exceeded the 80% thresholds (89.93%
  statements, 84.65% branches, 90.33% functions, 93.29% lines).
- Unit tests cover query contracts, URL parsing, invalidation paths and mutation
  behavior. Typecheck, lint, coverage and production build are required PR checks.

Local Supabase advisors reported existing RLS-policy performance warnings, three
existing mutable-search-path functions, and the intentional public-author definer
view. Neither new function was flagged. No policy/view redesign was made as part of
this performance change. Apply the [migration prerequisites](../setup/migrations.md)
before deploying the application.

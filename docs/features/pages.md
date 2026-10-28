# Pages data model

Issue #286 adds a dedicated Pages domain in `features/pages/`. It does not add a
page editor, dashboard navigation or public page route. Pages do not participate
in post taxonomy, newsletters or retired AI/API workflows. Public signup still
grants author access to posts; the contributor approval decision remains #111.

## Storage and permissions

`pages` holds private working title, slug, SEO title/description, JSON document,
status, revision and audit fields. `created_at`/`created_by` and
`updated_at`/`updated_by` are database-owned. `published_at`/`published_by` record
the last publication, retained after unpublishing. Actor IDs become null if that
profile is deleted; content is retained.

`page_snapshots` contains only explicitly published fields, page ID, revision and
publication time. Anonymous and authenticated readers can SELECT these snapshots.
A published page can have newer private working content: saving changes does not
modify its live snapshot or status. Publishing copies the locked working row to
the snapshot; unpublishing removes the snapshot and sets status to `draft`.

`pages:create`, `pages:read`, `pages:update` and `pages:publish` are admin-only.
The last capability includes unpublishing. Actions use `authorizeSession` and the
caller's cookie client; no service-role client or caller-supplied actor is used.
The database rechecks authoritative profile role and MFA before every operation,
including a retry. Authors and enrolled AAL1 admins cannot read working rows.
Direct writes to all page tables are revoked, even for authenticated admins.
Private `page_write_requests` and `page_slug_reservations` have no client SELECT
or mutation grants; their RLS has no public policies.

## Version 1 document

```json
{
  "version": 1,
  "blocks": [
    { "type": "paragraph", "text": "About our site." }
  ]
}
```

This minimal text storage contract is independent of the post HTML editor.
An empty block array is valid. Only the keys shown are accepted. Maximums are
500 blocks, 10,000 Unicode characters per paragraph, 200 for title/SEO title and 500 for
SEO description. Lengths count Unicode code points; title cannot contain only ECMAScript whitespace. SEO strings may be empty. Slugs are
1–120 lowercase ASCII letters/digits with single internal hyphens. No slashes,
leading/trailing hyphens or automatic normalization are accepted.

TypeScript and database validation both reject malformed documents, unknown block
types, extra keys and unsupported versions before saving. PostgreSQL constraints
also protect both stored copies. Future blocks/versions require an explicit
schema migration and matching validator/renderer release; never silently drop
unknown blocks, coerce versions or replace unsupported content with an empty doc.

`getPublishedPage(slug)` reads only snapshots and validates stored documents
before handing them to a future renderer. `getPage(id)` does the same for private
working data after authorization. Invalid/unsupported stored data returns
`PAGE_UNSUPPORTED_DOCUMENT`, never a working-copy fallback. Paragraph text must
be rendered as escaped text, not HTML. No rendering or HTML conversion is included
here. No application cache is introduced; future public routing must define cache
invalidation for publish/unpublish and decide how page slugs map to site routes.

## Atomic writes and retries

`writePage(input)` calls `write_page_atomic`. Its operations are:

- `create`: `{ operation, requestKey, values }`; always creates a private draft.
- `save`: `{ operation, requestKey, pageId, expectedRevision, values }`; replaces
  the complete working values, without publishing them.
- `publish` / `unpublish`: `{ operation, requestKey, pageId, expectedRevision }`;
  publishes exactly the expected working revision or removes its snapshot.

`values` contains exactly `title`, `slug`, `seo_title`, `seo_description` and
`document`. Every mutation returns `{ page, replayed }`. Every successful new
operation produces an opaque UUID revision, even if invoked in one transaction.
The caller must use that revision for its next operation. Stale revisions fail
with `PAGE_STALE`; refetch and reconcile rather than automatically overwriting.
All row, snapshot, slug and retry-receipt changes commit together or roll back.

Generate a fresh request key for a new operation, and retain the exact key/input
for network retries. Keys are nonblank strings up to 200 characters, scoped to the
actor across all operations. JSON object key order does not affect retry identity;
array order does. Reusing a key with changed payload, operation, page or revision
fails with `PAGE_RETRY_CONFLICT`. Concurrent first use of a key is serialized;
row locking plus the revision comparison allows only one competing save to win.

An exact replay returns the **current** page and `replayed: true`, without
repeating the mutation. It never restores old content or republishes an
unpublished page. A replay response can therefore include edits made since the
original request. Receipts are retained without expiry. Database role/MFA checks
happen before replay lookup so revoked permissions cannot retrieve a prior result.

Each claimed slug remains reserved to its page, including previous working slugs
and slugs of unpublished pages. Renaming a draft cannot release a live slug to
another page. Collision returns `PAGE_SLUG_CONFLICT` with no partial write.
These reservations are separate from post routes: there is no new public route,
redirect or shared root-path claim. Routing delivery must decide site-path
conflicts before exposing pages. No delete/release operation is included.

## Rollout

1. Apply ordered migrations through
   `20261028101334_add_page_content_model.sql` before deploying the server functions.
   This is additive and does not backfill or modify posts, profile privacy,
   recovery copies, developer keys or signup roles.
2. Run the checks below against a disposable migrated database with external mail
   and webhooks disabled. Verify author/anonymous denial and admin MFA access.
3. Deploy the server code. Existing app code can coexist with the new tables;
   application rollback does not require deleting page data or migration history.
4. Keep Pages UI, supported editor blocks and public routing behind their separate
   deliveries. Do not expose working rows as a shortcut for preview/publication.

## Verification

```bash
pnpm exec vitest run __tests__/features/pages __tests__/lib/permissions.test.ts
docker exec -i supabase_db_nextjs-blog-cms psql -U postgres -d postgres -v ON_ERROR_STOP=1 < database/tests/pages.sql
node database/tests/pages-concurrency.mjs
pnpm run typecheck
pnpm run lint
pnpm run docs:check
```

Use the repository's disposable local stack, never production. The concurrency
script accepts only container `supabase_db_nextjs-blog-cms`, with default database
`postgres`; `PAGES_TEST_DATABASE=cms_issue286` selects an isolated schema-only test
database in that container. `PAGES_TEST_USER=supabase_admin` is supported for a
schema clone owned by that local role. No hosted target or arbitrary database
name is accepted. SQL fixtures roll back; concurrent fixtures use random IDs and
remove their pages/users in `finally`. The suites perform no external requests.
CI runs both database suites after migrations. Browser UI/route verification is
not applicable until those separate deliverables exist.

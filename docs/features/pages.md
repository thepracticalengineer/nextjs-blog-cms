# Pages data model and block editor

Issues #286 and #287 provide the dedicated Pages domain in `features/pages/`,
atomic persistence, a reusable block editor and shared rendering. Dashboard
management/publishing (#288) and public URL routing (#289) remain separate deliveries. Pages do not participate
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
before handing them to `PageContent`. It uses the anonymous cookie-free client,
so public reads do not force request-bound dynamic rendering. `getPage(id)` does the same for private
working data after authorization. Invalid/unsupported stored data returns
`PAGE_UNSUPPORTED_DOCUMENT`, never a working-copy fallback. Paragraph text is rendered as escaped text, not HTML. No application cache is introduced; future public routing must define cache
invalidation for publish/unpublish and decide how page slugs map to site routes.

## Version 2 block documents

Version 1 stays valid and readable; no existing rows or published snapshots are
rewritten by the migration. Opening version 1 in the editor converts its paragraphs
losslessly to Tiptap JSON. The next explicit save can persist version 2. Legacy
documents exceeding the new limits are refused by the editor with their saved
content intact; they are never silently truncated.

```json
{
  "version": 2,
  "content": {
    "type": "doc",
    "content": [{ "type": "section", "content": [
      { "type": "paragraph", "content": [{ "type": "text", "text": "About our site." }] }
    ] }]
  }
}
```

Supported blocks are section, columns, column, button, paragraph, heading (1–6),
bullet/numbered lists and list items, quote, code, image and separator. Inline
content supports text, hard breaks and bold, italic, underline, strike, code and
link marks. Post-specific videos, tables, task lists and arbitrary HTML/CSS are
not page blocks; existing post editing and rendering keep their existing schema.

Containers use only these design values:

| Setting | Allowed values |
| --- | --- |
| Width | `content` (48rem), `wide` (80rem), `full` (parent width) |
| Background | `default`, `muted`, `accent` (existing theme tokens) |
| Padding / gap | `none`, `sm`, `md`, `lg` |
| Alignment | `left`, `center`, `right` |
| Column preset | `one`, `equal-two`, `wide-left`, `wide-right`, `equal-three` |
| Button style | `solid`, `outline` |

Defaults are wide width, default background, medium padding/gap and left
alignment. Columns default to two equal columns. Asymmetric presets are 2:1 or
1:2. Columns stack at 640px and below; large padding also reduces on mobile.
Columns may contain only column nodes and their count must match the preset.
A column may appear only inside columns. Sections/columns contain at least one
flow block. List items start with a paragraph.

Version 2 allows at most 1,500 nodes, depth 12 (document root at zero), 256 KiB of
compact UTF-8 JSON and 10,000 Unicode code points per text node. Attribute keys,
node/mark types, link destinations and structural nesting are allowlisted in
both TypeScript and PostgreSQL. Links accept HTTP(S), mailto, safe root-relative
paths and fragments; scripts, protocol-relative URLs, credentials, backslashes
and control/whitespace characters are rejected. Images additionally use the
configured image host allowlist at server write/read boundaries. Deployment
configuration is deliberately kept out of the browser bundle. Direct SQL/RPC
validation enforces safe URL shapes; server reads fail closed for images outside
the current deployment allowlist.

## Editor and rendering integration

`features/pages/editor/PageEditor.tsx` accepts an initial `document`, the current
account's `editorId`, and `onChange(document)` for version 2 changes. The caller
owns persistence through `writePage`; no editor operation publishes content.
Remount with a page/revision key to deliberately load a different saved document.
The editor does not replace unsaved input when a parent rerenders.

The inserter adds inside a selected section/column or after another selected
block. The nested outline selects blocks, supports sibling drag ordering and
Alt + Arrow Up/Down, and retains keyboard focus after moves. Move buttons provide
the same operation. Duplicate/delete, design settings and column preset changes
participate in undo/redo. Reducing columns appends removed columns' content to the
last retained column. Individual columns cannot be duplicated/deleted, preventing
invalid preset counts. The rich text toolbar includes links; button labels and
links are edited in block settings. Invalid edits/pastes preserve the previous
document and show an error.

`features/pages/PageContent.tsx` renders both versions using escaped React text
and semantic elements. Its CSS and layout hooks are shared with Tiptap, scoped to
`.page-canvas`, and independent of article prose styles. Editor Preview uses this
same renderer with current unsaved content, entirely in memory. The dashboard
must authorize the enclosing page and supply private working data only after
`getPage`; the future public route must supply `getPublishedPage` snapshots only.
Preview does not create a public URL or publish a snapshot.

### Page media permissions and retention

The editor reuses `ImageDialog` with `context="page"`. Upload, URL validation and
library requests pass a strict query-only `?context=page`, explicitly requiring
`pages:update` (admin plus existing MFA checks). An omitted context preserves post
behavior. Unknown, duplicated or body-based contexts are rejected. Each request
also verifies `editorId` against the current account; library reads and metadata
mutations remain scoped to the asset owner even for administrators.

Existing optimization, file/URL validation and owner-based hash reuse apply.
Image nodes preserve asset IDs, dimensions and alternative text; changing a URL
clears an obsolete asset ID. Library metadata is not overwritten by document-local
alt text. Page uploads receive durable library retention because post orphan
cleanup cannot inspect page documents. Images remain public at their URLs, and
archiving does not delete stored files. See [image rules and library behavior](post-images.md).

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

Each page reserves its current working slug and, when different, its live snapshot
slug. Saving releases abandoned working slugs; publishing or unpublishing releases
previous live slugs that are no longer used by the working copy. Pruning happens
atomically with the write. Renaming a draft cannot release a still-live slug to
another page. Retries never reclaim previously released slugs. Collision returns `PAGE_SLUG_CONFLICT` with no partial write.
These reservations are separate from post routes: there is no new public route,
redirect or shared root-path claim. Routing delivery must decide site-path
conflicts before exposing pages. There is no page delete operation or historical page redirect reservation.

## Rollout

1. Apply ordered migrations through
   `20261028135854_add_page_document_v2.sql` before deploying the editor/server functions.
   This is additive and does not backfill or modify posts, profile privacy,
   recovery copies, developer keys or signup roles.
2. Run the checks below against a disposable migrated database with external mail
   and webhooks disabled. Verify author/anonymous denial and admin MFA access.
3. Deploy the server code. Existing app code can coexist with the new tables;
   application rollback does not require deleting page data or migration history.
   Code predating version 2 cannot edit/render version 2 rows; retain version 2
   reader support when rolling back, or keep those pages unavailable without
   rewriting their documents.
4. Integrate the reusable editor into the authorized dashboard delivery (#288)
   and the snapshot renderer into public routing (#289). Do not expose working
   rows as a shortcut for preview/publication.

## Verification

```bash
pnpm exec vitest run __tests__/features/pages __tests__/lib/permissions.test.ts
docker exec -i supabase_db_nextjs-blog-cms psql -U postgres -d postgres -v ON_ERROR_STOP=1 < database/tests/pages.sql
node database/tests/pages-concurrency.mjs
pnpm exec playwright test --config=e2e/page-editor.config.ts
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
CI runs both database suites after migrations. The isolated browser suite mounts
the real editor and renderer at desktop/mobile sizes with local media fixtures.
It checks editing and serialized reload, nesting, undo/redo, keyboard/drag moves,
settings, media metadata, layout parity and overflow. It performs no Auth, database
or external requests. The SQL suite separately checks real version 2 save/read,
snapshot isolation and malformed documents. Full dashboard-to-public-route
verification remains part of #288/#289.

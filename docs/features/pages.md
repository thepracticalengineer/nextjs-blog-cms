# Pages management, publishing, public URLs and block editor

Issues #286–289 provide the dedicated Pages domain in `features/pages/`,
atomic persistence, a reusable block editor and shared rendering. Administrators
manage and publish pages; visitors read published snapshots at flat URLs such as
`/about` and `/contact`, with permanent redirects and published-only SEO.
Pages do not participate
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

`page_revisions` is private, append-only history: one row per successful write,
holding the resulting working values, status, operation, actor and time. See
[revision history and restore](#revision-history-and-restore).

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
`PAGE_UNSUPPORTED_DOCUMENT`, never a working-copy fallback. Paragraph text is rendered as escaped text, not HTML. The public route uses request-local deduplication with dynamic rendering and no
cross-request page cache. Publication invalidates all page URLs and the sitemap.

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

### Image-host failures and recovery

After authorization, page saves and private reads identify a disallowed image with
`PAGE_IMAGE_NOT_ALLOWED` and `error.image: { src, path }`. `path` lists zero-based
indices through the document's nested `content` arrays, so `[0, 1]` identifies the
second child of the first top-level block. The first offending image is returned
in document order. Treat the source as text in error UI; never interpret it as
HTML. An input-image failure reports `writeAttempted: false` because that attempt is
rejected before persistence. A blocked mutation response omits this marker: the
write may already have committed.

Private `getPage` and public `getPublishedPage` reads both remain fail-closed if a
previously configured image host is removed. The private error identifies the
image; the public error remains `PAGE_UNSUPPORTED_DOCUMENT` without its source or
path. Saved content is retained unchanged. To repair such an existing page,
restore the trusted host in the deployment's image allowlist, open the page,
replace/remove its image and save, then remove the host again. Unsaved editor
input can be repaired directly using the returned image path. Mutation-response
errors (including exact retries) do not imply rollback: if an existing result is
blocked by changed host configuration, keep the request key and reconcile it
after restoring access rather than assuming the mutation did not run.

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
links are edited in block settings. The clipboard parser preserves page buttons
and their layout wrappers during
copy/cut and paste. Pasted website link presentation attributes are normalized to
the supported safe values; unsupported list numbering styles become decimal,
invalid list starts become 1, and nonnumeric/out-of-range image dimensions are
dropped. Text and supported blocks are retained. Unsafe URLs, malformed layouts
or oversized edits still preserve the previous document and show an error.

`features/pages/PageContent.tsx` renders both versions using escaped React text
and semantic elements. Its CSS and layout hooks are shared with Tiptap, scoped to
`.page-canvas`, and independent of article prose styles. Editor Preview uses this
same renderer with current unsaved content, entirely in memory. The dashboard
must authorize the enclosing page and supply private working data only after
`getPage`; the public route uses `resolvePublicPage`, which supplies validated snapshots only.
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
- `publish`: `{ operation, requestKey, pageId, expectedRevision, reviewed: true, confirmUrlChange?: boolean }`;
  `unpublish`: `{ operation, requestKey, pageId, expectedRevision }`;
  publishes exactly the expected working revision or removes its snapshot.
- `restore`: `{ operation, requestKey, pageId, expectedRevision, sourceRevision }`;
  copies a stored revision of the same page into the working values (see
  [revision history and restore](#revision-history-and-restore)).
- `trash`, `recover`: `{ operation, requestKey, pageId, expectedRevision }`;
  `purge`: the same plus `confirmSlug`; `move`: the same plus `parentId` (UUID or
  `null`) and `position`. See [trash, restore and permanent deletion](#trash-restore-and-permanent-deletion)
  and [page hierarchy](#page-hierarchy). SQL receives `confirmSlug`, `parentId` and
  `position` in `p_options`, which is part of retry identity.

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

Each page reserves its working slug and every URL at which it has been published.
Abandoned draft-only slugs are released atomically; published slugs are retained
indefinitely, including after unpublish. Collisions return `PAGE_SLUG_CONFLICT`
without a partial write. Claims use the existing unique slug key and page lock;
concurrent claims cannot acquire the same URL. Exact retries cannot reclaim an
abandoned draft-only slug or repeat publication.

## Revision history and restore

Every successful `create`, `save`, `publish`, `unpublish` and `restore` appends one
`page_revisions` row in the same transaction as the write. The row is keyed by the
revision UUID the write produced and stores the resulting title, slug, SEO fields,
document and status, plus the operation, the acting administrator and the time.
Failed or replayed writes record nothing. History starts with migration
`20261104110000_page_revisions.sql`: earlier saves were never stored, so each
existing page gets a single `baseline` row for its current working values.

Revisions use the same privacy as working rows: only administrators who pass the
MFA check can SELECT them, and direct inserts, updates and deletes are revoked for
every client role. `list_page_revisions(page_id, limit)` returns at most 100 summaries, newest first,
without documents. It includes the author's profile name, joined only after the
administrator check. The dashboard reads one full revision through `getPageRevision`.
Both actions require `pages:read`, and restore requires `pages:update`.

`restore` changes the working copy only. It requires the current
`expectedRevision`, so it cannot overwrite a newer save (`PAGE_STALE`). It accepts
only a revision of the same page (`PAGE_REVISION_NOT_FOUND`), and is subject to the
same reserved-namespace and slug-reservation checks as a save. Status,
`published_*` fields and the public snapshot stay unchanged. Restored content
reaches visitors only through a normal publish with explicit human review and,
if the slug differs from the live URL, URL-change confirmation. The server action
rejects a revision whose images use a host that is no longer allowed, before it
writes anything. The `sourceRevision` is part of retry identity.

Revisions are retained for the life of the page, with no automatic pruning,
including while the page is in the trash. Permanent deletion erases them and keeps
only a single `purge` audit row (see [trash, restore and permanent deletion](#trash-restore-and-permanent-deletion)).
Trash, restore from trash and moves also append revisions (`trash`, `recover`,
`move`), recording who acted and when; their content equals the previous row.

In the editor, **Revision history** is a collapsed panel that queries only while
open and refreshes after each write. Selecting a revision shows how restoring it
would change the current saved draft: changed title, URL and SEO fields, and
added or removed text lines (headings, paragraphs, image alternative text and
button labels/targets). It notes when only layout or formatting differs, and
offers a private preview. **Restore as working draft** is disabled while there
is unsaved input or an unconfirmed request, and asks for confirmation first. On
success, the editor loads the restored values and publication review starts again.

## Trash, restore and permanent deletion

**Move to trash** (`trash`, `pages:publish`) is available in the editor for a saved
page without unsaved input, after confirmation. It sets `trashed_at`/`trashed_by`,
sets status to `draft` and removes the public snapshot in the same transaction, so
the current URL and every historical alias return 404 immediately. All URL
reservations are kept, so no other page can claim a trashed page's URLs. A
trashed page is read-only: `save`, `publish`, `unpublish`, `restore` and `move`
fail with `PAGE_TRASHED`. A page that still has active (not trashed) child pages
cannot be trashed (`PAGE_HAS_CHILDREN`): move or trash the children first, so
children are never silently trashed, deleted or orphaned.

Dashboard → Pages → Status **Trash** lists trashed pages, newest first.
**Restore** (`recover`, `pages:update`) returns the page to its previous parent at
the end of its siblings, always **unpublished**. Going live again requires the normal
reviewed publish. A child whose parent is still in the trash cannot be restored
(`PAGE_PARENT_TRASHED`); restore the parent first. The editor of a trashed page
offers the same restore.

**Retention policy.** Trashed pages are kept indefinitely; there is no automatic
purge. **Delete permanently** (`purge`, `pages:publish`) is available only from the
Trash view and only for a trashed page. The administrator must type the page's URL
slug, and the database rejects a mismatch (`PAGE_DELETE_CONFIRMATION_REQUIRED`).
Permanent deletion cannot be undone. In one transaction it:

- replaces the title, SEO fields and document with an empty tombstone and sets `purged_at`;
- deletes every revision of the page (keeping one `purge` audit row that holds only
  tombstone values) and every stored retry payload except the purge's own;
- detaches any trashed children to the top level, so they can still be restored;
- **keeps the page row and all of its URL reservations**. Former URLs stay
  unclaimable and keep returning 404, so links cannot be hijacked by a new page.

Purged pages never appear in lists and accept no further operations
(`PAGE_NOT_FOUND`); an exact retry of the purge request still replays.
Pages reference images by URL and never own media files, so trash and permanent
deletion do not delete or archive media; the media library's own rules apply.

## Page hierarchy

Pages can have a parent (`parent_id`) and an order among siblings (`position`).
**URLs stay flat**: hierarchy is organizational only. It never changes a slug, a
reservation, a redirect, the sitemap or a public page. In the editor, **Page
attributes** (loaded only when opened) offers a parent and a position ("First"
or "After …"). **Move page** sends `move` with the page's current revision. The
Pages list shows each page's parent.

The database enforces the rules under a single hierarchy lock, so concurrent moves
cannot race into an invalid tree:

- no cycles: a page cannot be its own parent or sit under its own descendant (`PAGE_HIERARCHY_CYCLE`);
- bounded depth: at most three levels, counting the moved page's whole subtree,
  including trashed descendants that could be restored later (`PAGE_HIERARCHY_TOO_DEEP`);
- the parent must exist and not be trashed or purged (`PAGE_PARENT_NOT_FOUND`, `PAGE_PARENT_TRASHED`);
- `position` is an integer from 0 to 10,000 counting active siblings other than the
  page itself; larger values append. Sibling positions are kept dense (0…n-1),
  and only the moved page's revision changes.

New pages are appended to the top level. The migration places existing pages at
the top level in their current list order. Unpublishing a parent has no effect on
its children, and a child can be published under an unpublished parent; with flat
URLs there is no dependency between them.

## Public URLs, redirects and SEO

`app/(public)/[slug]/page.tsx` resolves a single flat path using
`resolve_page_path`. The database joins only formerly published reservations to
current snapshots. Unknown, draft-only and unpublished pages return 404; working
content and pending slug changes never enter HTML, metadata or redirects. Database
outages fail as errors rather than successful empty content. Unsupported snapshots
fail closed. Post, taxonomy, author and application routes retain their behavior.

Stored slugs must already be canonical lowercase ASCII with single internal
hyphens (no automatic rewrite on save). Incoming mixed-case paths normalize to
lowercase and redirect directly to the current published destination. Next handles
trailing-slash removal; percent-decoded separators, nested paths, whitespace,
dots, underscores and double-encoded input are rejected. Root application names
are reserved: `blog`, `dashboard`, `authors`, `api`, `auth`, `login`, `register`,
`mfa`, `forgot-password`, `reset-password`, `confirm-email`,
`onboarding-unavailable`, `newsletter`, `screenshots`, `sitemap`, `robots` and
`favicon`. The grammar additionally excludes framework and static endpoints such
as `_next`, `.well-known`, `sitemap.xml` and `favicon.ico`. Add future root namespaces
to both the TypeScript guard and a migration before deploying those routes.
A filesystem regression test checks root routes (including route groups) and
claimable static asset names against the TypeScript reservation set.

Save Draft can prepare a new URL without moving the live page. Publishing a changed
URL requires the separate confirmation checkbox and `confirmUrlChange: true`
(`p_confirm_url_change` in SQL), as well as editorial review. The database checks
the last published slug under the revision lock, even after unpublish. Confirmation
is bound to retry identity. A rename from A to B to C makes both A and B return a
direct permanent 308 redirect to C, with no chain. View Page always uses the last
published URL rather than the pending working slug.

Unpublish removes the snapshot: current URLs and historical aliases all return
404 while reservations remain private. Republish reactivates aliases and points
them directly at the new snapshot. Trash withdraws the snapshot the same way and
retains these reservations, and restoring from trash stays unpublished until explicit
review and publication. Permanent deletion also keeps the reservations. There is no
public fallback to retained working data.

Canonical, title, description, Open Graph and Twitter metadata derive only from
the snapshot and the configured `NEXT_PUBLIC_SITE_URL` origin. Empty SEO title uses
the published title; empty description suppresses the layout default. Social cards
use the existing site logo convention. The sitemap reads current snapshots in
batches of 50 and applies the same schema and image-host validation as the public
route, omitting snapshots that would return 404. It uses publication time, never
draft update time or redirect aliases. Publish,
unpublish and successful retries invalidate the page route pattern (all old/new
URLs), `/sitemap.xml` and `/dashboard/pages`. Draft saves invalidate only the
management listing. Dynamic public responses prevent stale withdrawn content from
persisting in the application cache.

## Rollout

1. Apply ordered migrations through
   `20261029152514_page_public_urls.sql` before deploying public routing/server functions.
   Apply `20261104110000_page_revisions.sql` before deploying revision history. It replaces
   `write_page_atomic` with a version that adds `p_source_revision` (default null),
   so existing callers keep working. It backfills one `baseline` revision per
   existing page and does not touch snapshots, reservations or posts.
   Then apply `20261105140000_page_trash_hierarchy.sql` before deploying trash and
   hierarchy. It adds the trash and hierarchy columns, places existing pages at the top
   level, and replaces `write_page_atomic` again, adding `p_options` (default null),
   so earlier callers keep working. It does not change snapshots, reservations or posts.
   This backfills reservations and the last published slug from current snapshots;
   previously released URLs and old unpublished history cannot be reconstructed.
   Existing reserved-name drafts remain readable so an admin can rename them;
   reserved-name snapshots are not exposed by the new resolver or sitemap.
   Inventory such pages and deliberately rename/review/publish them before rollout.
   The publication RPC now requires an explicit `p_reviewed: true`; older callers
   omitting it fail closed. Save/create/unpublish retain their contracts.
   This is additive and does not backfill or modify posts, profile privacy,
   recovery copies, developer keys or signup roles.
2. Run the checks below against a disposable migrated database with external mail
   and webhooks disabled. Verify author/anonymous denial and admin MFA access.
3. Deploy the server code. Existing app code can coexist with the new tables;
   application rollback does not require deleting page data or migration history.
   Code predating version 2 cannot edit/render version 2 rows; retain version 2
   reader support when rolling back, or keep those pages unavailable without
   rewriting their documents.
4. Verify a published URL, a historical redirect and an unpublished 404; check
   canonical metadata and sitemap. Do not expose working rows for public preview.

## Verification

```bash
pnpm exec vitest run __tests__/features/pages __tests__/lib/permissions.test.ts
docker exec -i supabase_db_nextjs-blog-cms psql -U postgres -d postgres -v ON_ERROR_STOP=1 < database/tests/pages.sql
docker exec -i supabase_db_nextjs-blog-cms psql -U postgres -d postgres -v ON_ERROR_STOP=1 < database/tests/page_revisions.sql
docker exec -i supabase_db_nextjs-blog-cms psql -U postgres -d postgres -v ON_ERROR_STOP=1 < database/tests/page_trash_hierarchy.sql
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
snapshot isolation and malformed documents. URL lifecycle SQL and public-route unit tests cover redirects, snapshot privacy and SEO. The management harness verifies the real
editor workflow with fixture action responses; SQL tests independently verify persistence.

## Dashboard workflow and private recovery

Dashboard → Pages is admin-only, with title search, draft/published filtering,
20-row server pagination and stable updated-time/ID ordering. The list excludes
page bodies. Add Page uses a stable draft UUID in the URL. Edit routes, server
actions and database writes enforce admin/MFA access independently.

Save Draft requires a nonblank title, valid lowercase flat slug, supported blocks
and bounded SEO fields. It never changes a published snapshot. Publish/Update
requires a saved revision, meaningful text or an image, alternative text on every
image, allowed image hosts and explicit human review of that saved revision.
There is no article word-count/excerpt requirement. SEO title and description are
optional: an empty title falls back to the page title, and an empty description is
omitted by public routing. Field bounds remain 200/500
characters. Every edit and successful mutation clears the review checkbox.
Database publication checks run under the page lock and reject missing review,
empty content or missing image alternatives. A client cannot bypass these checks
by calling the RPC directly. Existing snapshots are not retroactively withdrawn.

Private Preview renders current unsaved content in memory using `PageContent`,
inside the authorized dashboard. It creates no public preview token or URL.
Dashboard page responses use private/no-store headers and noindex/nofollow;
metadata is generic, not draft-derived. Uploaded images retain their existing
public asset URL contract: preview does not make an uploaded asset private.

Recovery is versioned browser storage scoped to the current account and draft
UUID, with separate records for each editor instance so tabs cannot overwrite
one another. Pages lists available recovery records. Recovery is local to that
browser, not a cross-device backup; clearing browser storage removes it. A changed
account cannot view the mounted editor, and writes are pinned to the opening
account. Recovery retains incomplete input and exact pending mutation payloads.
A request is stored before dispatch; unavailable storage blocks dispatch rather
than risking a duplicate create after reload. Auth/network failures retain the
same request key. Retry never changes payload or silently creates another page.

Stale writes preserve input and require loading the latest saved revision before
retrying. Load latest first retains current input in recovery. A replay returning
newer saved content also blocks implicit overwriting. Replayed publication state
is conservatively reconciled without claiming another editor changed it. Links, browser traversal,
reload and shared sign-out controls warn before leaving unsaved work. Duplication
stores a new create request with a distinct UUID-derived slug, creates an unpublished
draft and opens its recoverable editor; a lost result can only retry that same
create. It does not copy publication state or claim the source URL. Unpublish
removes the snapshot while retaining working content. No page operation enqueues
post newsletters.

Run `pnpm exec playwright test --config=e2e/page-management.config.ts` for real
editor/renderer flows on desktop/mobile, keyboard review, private preview,
snapshot-preserving save, unpublish, duplicate creation, lost-response reload,
exact retry and navigation cancellation. This isolated harness uses synthetic
HTTP actions without database, Auth, mail or webhooks; it cannot establish hosted
Auth behavior. Run the existing Pages SQL and concurrency suites on a disposable
migrated database to verify actual authorization, locks, review/readiness and
snapshot/retry contracts. The browser harness also verifies explicit URL-change confirmation and View Page
links. Public resolver/metadata unit tests exercise the real route module; they do
not replace deployment HTTP/redirect verification.

### Correcting rejected requests and list navigation

A first-attempt preflight rejection unlocks the editor for correction. An image
error after an unresolved earlier attempt retains the exact request: restoring the
configured image host and retrying confirms whether the original write committed.
Never discard that identity just because the latest preflight did not call the RPC.
A deterministically rejected duplicate stays on the source editor, shows its error,
and retains an editable copy with no pending request in browser recovery.

Title search uses an escaped case-insensitive regular expression so characters
such as `*`, `%`, `_` and regex punctuation are literal substring text. Out-of-range
bookmarks render an empty list with a First page link instead of a permanent load
error; normal database failures still show an error.

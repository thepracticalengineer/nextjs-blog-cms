# Post images

Apply `supabase/migrations/20261007155857_post_media_uploads.sql` before deploying
this feature. It creates the public `post-media` bucket, a server-only registry,
reference-retention triggers, and `posts.cover_image_alt`. Existing covers keep the
post title as their initial description without changing their modification dates or
optimistic save tokens; editors can replace it with specific alt text.

## Editor workflow

Use **Choose cover image**, or **Insert or edit image** in the article toolbar.
Select a file through the labeled file picker, or paste an image file into the
article, cover URL field, or open image dialog. Dropping a file into the article
opens the same dialog at the drop position. Clipboard text and HTML take priority
over accompanying image renditions, so copied rich text keeps its normal paste
behavior. Then choose **Upload image / retry**.
Transfer progress and server processing are announced. Add an image description
before choosing **Use image**. Inline images can deliberately be marked decorative;
cover images require a description in the dialog. Select an existing inline image
and use the toolbar button again to edit its description or source.

Failed validation, upload or URL checks leave the article and selected file intact.
Retry uses that same file. Long filenames wrap within the dialog and remain available
in full, while tall content scrolls vertically above the visible footer. Choose
**Use image** to apply the image and description to the post. Closing a changed dialog
through Cancel, Close, Escape or its backdrop opens **Discard image changes?**.
**Keep editing** preserves the selected file, URL, description and active request;
**Discard changes** closes without inserting an image and cancels the browser request.
Unchanged dialogs close immediately. Uploading an image does not apply it to the post. A server upload that finishes after cancellation remains an abandoned
upload until saved or cleaned up. The cover thumbnail reports broken URLs and offers
retry rather than silently hiding the image. Manual cover URL entry remains available;
its thumbnail and reader preview enforce the configured host policy.

## Validation and storage

JPEG, PNG and WebP files must be non-empty and at most **4 MiB**. The server decodes
the actual bytes, checks the MIME type against the decoded format, rejects animation
and inputs over **40 megapixels**, normalizes orientation, strips metadata, and
encodes WebP at quality 82. Images are resized proportionally to at most **2400 pixels**
on each side without enlargement; the output must fit within **2 MiB**. SVG and GIF
are unsupported. The 4 MiB input limit leaves room for multipart framing under
[Vercel's 4.5 MB function payload limit](https://vercel.com/docs/functions/limitations#request-body-size).
Immutable object names use `<uploader UUID>/<random UUID>.webp`.

Apply `supabase/migrations/20261019051428_post_media_content_reuse.sql` before
deploying the image reuse endpoint. The server hashes optimized WebP bytes with
SHA-256 and atomically reserves one active path for each owner/content pair. Names
are not part of identity: renamed identical files reuse the image, while different
images with the same name remain uploadable. Reuse announces **This image has already
been uploaded** and returns its existing URL. Storage writes never overwrite;
concurrent requests and retries target the same reserved key. Failures remain
retryable at that key. Reuse refreshes the seven-day abandonment grace period under
the cleanup row lock; deleting/deleted tombstones always require a new path.

Legacy media must be indexed during deployment, outside the request time budget.
Temporarily pause and drain image uploads on the old deployment, apply the migration, then
preview and run this resumable server-only command with the intended environment:

```bash
node --env-file=.env.local scripts/backfill-post-media.mjs
node --env-file=.env.local scripts/backfill-post-media.mjs --apply
```

Deploy the endpoint and resume uploads after the command reports zero pending rows.
The command downloads existing objects in batches of 50, hashes their stored bytes,
and updates only registry metadata. Missing objects are marked checked once;
transient errors stay pending and a rerun resumes without downloading indexed rows.
Existing objects, URLs and duplicates remain unchanged. Upload requests only perform
an indexed one-row readiness check for the current owner. An incomplete handoff
returns an explicit indexing message instead of silently creating a duplicate of
unindexed legacy media. There are no legacy object downloads in the upload path.
Only the requesting owner's registry is searched or returned. Hash identity uses the
current optimized representation, so a future encoder/quality change needs an
explicit hash-version/migration decision.

`POST /api/post-media` requires a same-origin authenticated author/admin session
and the editor's original account ID. Only the server can upload objects or access
the registry; browser clients cannot list, upload, overwrite or delete bucket objects.
No service-role credential reaches the browser. Images are **public to anyone with
their URL**, including uploads used in drafts. Do not upload confidential assets.

New cover and inline URLs are checked against the same allowlist as Next.js cover
optimization: configured Supabase public-storage paths, `IMAGE_REMOTE_HOSTS` HTTPS
hosts, and local image paths. External URLs are checked for browser loadability
before insertion. The configured loopback Supabase storage origin also supports
HTTP for local development; Next.js private-IP optimization is enabled only in
`development` with a loopback Supabase host. Production private-IP blocking stays on.
Legacy inline HTTP/HTTPS images remain renderable for compatibility.

TipTap images store alt text and intrinsic width/height; reader preview and public
article preserve those dimensions and use lazy loading and asynchronous decoding.
Article and reader-preview covers show the entire image without cropping, preserving
its aspect ratio within the reserved responsive space. Listing thumbnails still crop
to fill their cards. Cover containers use the edited description,
falling back to the post title when none is saved. Newsletter covers use the same
description and fallback.
Dashboard saves and recovery copies preserve cover descriptions (`image_alt`)
alongside `image_url`. The external REST write API is retired. Alt text does not replace human
editorial review of image meaning, rights or suitability.

## Abandoned uploads

A database trigger permanently protects an image as soon as any saved post or private
working copy references its storage path. Another post can reuse the public URL;
removing or deleting the original post never releases that protection. This conservative
policy also protects recovery and historical uses. It does not automatically reclaim
previously referenced media; review those manually if long-term pruning is needed.

Never-referenced uploads become eligible after **seven days**. On the server, load
the intended environment and preview a batch of up to 100 candidates:

```bash
node --env-file=.env.local scripts/cleanup-post-media.mjs
```

After reviewing the target and candidates, apply the cleanup:

```bash
node --env-file=.env.local scripts/cleanup-post-media.mjs --apply
```

Run again for another batch; an operations scheduler may run this command daily.
There is no automatic browser-side deletion. Cleanup claims rows under the same
locks used by save triggers, then removes objects through the Storage API. A save
that loses the race fails atomically and asks the editor to upload the expired image
again. Tombstones prevent old device-only recovery copies from restoring deleted
URLs. Failed deletion stays resumable on the next run. Device-only drafts that never
reached the server must be recovered within seven days to retain their uploads.

## Verification

`database/tests/post_media_dedup.sql` checks service-only reservation access, owner
isolation, grace-period refresh and tombstones. `node database/tests/post-media-concurrency.mjs`
checks 20 independent connections reserve one path in the designated disposable
`supabase_db_nextjs-blog-cms` container. `pnpm exec playwright test --config=e2e/image-dialog.config.ts`
checks the actual shared component/CSS at desktop/mobile/short viewports, dismissal
paths, keyboard focus, URL and file workflows, failures, retries and reuse feedback
with isolated HTTP fixtures and no database access.

`database/tests/post_media.sql` checks registry permissions, post/recovery retention,
shared references, the grace period, cleanup retries, expired URL rejection and atomic
cover metadata saves. Run only on a migrated disposable database. Unit tests cover
file decoding/limits, account/origin checks, failure/retry, metadata and rendering.
`e2e/browser/post-media.spec.ts` exercises real picker/paste uploads, unauthorized
storage operations, failed upload recovery, and preview/public image rendering on the
dedicated test Supabase project.

## Owner-only media library

**Dashboard → Media** lists only the signed-in user's completed uploads. Authors
and administrators have the same ownership boundary: administrators cannot list,
inspect, edit, select or archive another owner's assets. All library endpoints
verify the session, MFA assurance and original editor account before service-role
access; mutations also require same origin. A live account change unmounts cached
library data and cancels active browser transfers. The bucket and its URLs remain
public, including images in drafts and archived images.

The dashboard offers title/filename/metadata search, grid and list views, sorting,
active/archived filters and pages of 24 assets. Search matches literal text, including
`*`, `%`, `_` and backslashes. Title sorting uses the filename when the title is empty;
images with neither a title nor a filename appear last. Select up to 20 JPEG/PNG/WebP files
per batch; transfers run sequentially, with individual progress and retry. Existing
validation and optimized immutable WebP storage are unchanged. Identical content
still deduplicates within its owner, including renamed files. Reuploading an archived
image preserves its archive state. The upload queue reports **Already in your archive**
and offers **Open archived image** to restore it directly. It can also be restored
from **Archived images** to make it available in the picker.

Details show the stored WebP size, dimensions, upload date and original filename
when known, plus a public URL to copy. Title, default alt text, caption and description
are editable. The editor's **Media Library** tab copies default alt text and dimensions
into the chosen cover or inline occurrence; the description remains editable there.
Updating library metadata never rewrites posts. Captions and descriptions are library
metadata only and are not rendered in articles. Original source bytes are not retained;
avatars remain separate.

**Archive image** removes an asset from active browsing and selection without deleting
its object, URL, metadata or historical retention. **Restore image** reverses this.
There is no permanent-delete endpoint or cross-owner usage report. Archive, restore,
opening active image details, metadata edits, picker selection and intentional library
uploads set separate durable
`library_retained` protection. Historical `retained` protection remains permanent.
Unreferenced editor-only uploads still have the seven-day grace period unless a
library action retains them. Browsing alone does not retain an upload; the library
explains that unused editor uploads may expire. Opening details awaits durable retention
before displaying the public URL, protecting both the Copy URL button and manual copying.
If cleanup wins first, details show an error instead of a copyable expired URL. Archived
details already have durable retention and do not restore the asset implicitly. Cleanup respects both protection flags under the same
row locks as saves and library actions; a selection that loses to cleanup fails
rather than resurrecting a tombstone.

### Library migration and handoff

For `supabase/migrations/20261027084010_owner_media_library.sql`, **pause and drain all
image uploads on the old deployment before applying the migration**. Apply it and `supabase/migrations/20261027090813_media_library_literal_search.sql`, deploy
the matching application, verify the library, then resume uploads. This handoff is
required: old application instances do not confirm uploads in the new registry and
could otherwise leave successfully stored assets marked pending after the backfill.
Do not run the migration with old in-flight uploads still writing objects.

The migration preserves paths and URLs and confirms existing registry rows only when
a matching `storage.objects` row exists. It uses that object's creation timestamp and
stored byte size where available. Unknown original filenames and dimensions remain
null and are displayed honestly. Reservations without stored objects remain pending
and do not appear as selectable images. New uploads become ready only after successful
storage completion; failures retry the same immutable key. Stable `uploaded_at` is
separate from the legacy `created_at` cleanup clock, so reuse does not change the
library upload date or overwrite customized metadata.

Library API: `GET /api/post-media/library` accepts `editorId`, `q`, `page`,
`sort=newest|oldest|title`, and `filter=active|archived`.
`GET /api/post-media/library/[id]` requires `editorId`.
`PATCH /api/post-media/library/[id]` accepts `editorId` and editable metadata or
`archived: true|false`. `POST /api/post-media/library/[id]/select` accepts `editorId`
and durably protects the selected asset before returning it. Known foreign IDs return
404 and never reveal private metadata. List/detail responses are not cached.

### Library verification

Run `pnpm exec vitest run __tests__/api/media-library.test.ts __tests__/api/post-media.test.ts __tests__/features/posts/media-library-ui.test.tsx __tests__/auth/mfa-authorization.test.ts`.
Run `pnpm exec playwright test --config=e2e/media-library.config.ts` for isolated
real-component desktop/mobile search, details, archive/restore, picker default/override,
keyboard activation, bounded layout and upload failure/retry checks.

On the designated migrated disposable database, run
`database/tests/media_library.sql` with `psql -v ON_ERROR_STOP=1`,
`node database/tests/media-library-concurrency.mjs` and
`node database/tests/media-library-upgrade.mjs`. These cover ownership, retention,
archive/dedup semantics, real row-lock races and the legacy backfill. The upgrade test
rolls its temporary schema changes back. Existing media SQL and concurrency tests
remain required. CI includes the new database tests and isolated browser suite.

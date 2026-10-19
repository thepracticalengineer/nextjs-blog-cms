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

Existing owner objects are hashed lazily on that owner's next upload, in pages of
50 registry entries. They are downloaded server-side once for hashing and their
objects/URLs stay unchanged. This first upload can take longer for a large library.
A storage/indexing outage fails the request with retry guidance instead of bypassing
deduplication. Missing objects from interrupted legacy uploads are skipped. Existing
duplicate objects are preserved; future uploads reuse an active matching object.
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
Cover containers reserve responsive layout space and use the edited description,
falling back to the post title when none is saved. Newsletter covers use the same
description and fallback.
REST create/update accepts `image_alt`, returned with `image_url`; dashboard saves
and recovery copies preserve cover descriptions. Alt text does not replace human
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

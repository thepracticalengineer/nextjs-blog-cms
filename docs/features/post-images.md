# Post images

Apply `supabase/migrations/20261007155857_post_media_uploads.sql` before deploying
this feature. It creates the public `post-media` bucket, a server-only registry,
reference-retention triggers, and `posts.cover_image_alt`. Existing covers keep the
post title as their initial description; editors can replace it with specific alt text.

## Editor workflow

Use **Choose cover image**, or **Insert or edit image** in the article toolbar.
Select a file through the labeled file picker, or paste an image file into the
article, cover URL field, or open image dialog. Then choose **Upload image / retry**.
Transfer progress and server processing are announced. Add an image description
before choosing **Use image**. Inline images can deliberately be marked decorative;
cover images require a description in the dialog. Select an existing inline image
and use the toolbar button again to edit its description or source.

Failed validation, upload or URL checks leave the article and selected file intact.
Retry uses that same file. Cancel stops the active browser request without inserting
an image. A server upload that finishes after cancellation remains an abandoned
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
Cover containers reserve responsive layout space and use the edited description.
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

`database/tests/post_media.sql` checks registry permissions, post/recovery retention,
shared references, the grace period, cleanup retries, expired URL rejection and atomic
cover metadata saves. Run only on a migrated disposable database. Unit tests cover
file decoding/limits, account/origin checks, failure/retry, metadata and rendering.
`e2e/browser/post-media.spec.ts` exercises real picker/paste uploads, unauthorized
storage operations, failed upload recovery, and preview/public image rendering on the
dedicated test Supabase project.

# Post videos

## Editor workflow

Place the cursor in the article and choose **Insert or edit video**. Enter a URL
and choose **Apply**. To change or remove a player, choose **Select video** above
it, open **Insert or edit video** again, then apply another URL or choose
**Remove video**. Each operation supports editor undo/redo. Cancel, Escape,
backdrop and close-button dismissal leave content unchanged. If the document
changes while the dialog is open, cancel and reopen it before applying.

Supported URLs:

- HTTPS YouTube watch links (`https://www.youtube.com/watch?v=VIDEO_ID`) and
  shortened links (`https://youtu.be/VIDEO_ID`). YouTube embed URLs also work.
  Shorts (`/shorts/…`) and live (`/live/…`) URLs are unsupported; use the
  corresponding watch link instead.
- Direct HTTPS URLs whose path ends in `.mp4` or `.webm`, including query
  parameters such as signed access tokens. Filename extensions are case insensitive.

YouTube links are normalized to privacy-enhanced `www.youtube-nocookie.com`
embeds. Tracking, start-time, playlist and autoplay parameters are discarded.
YouTube `?t=` start times are also discarded. Direct URLs retain their query parameters. URLs containing credentials, whitespace,
control characters or nonstandard ports are rejected. Other providers, executable
schemes, HTTP video files, arbitrary iframes, uploads and transcoding are unsupported.

Players have visible controls, a 16:9 responsive frame and no autoplay. Direct
videos preserve their natural aspect ratio inside that frame and do not preload.
Video nodes and URLs are stored in the article JSON and retained in working copies,
explicit saves, previews and published articles. Videos do not count toward the
publication minimum word count or replace human editorial review.

## Remote playback and privacy

A valid URL does not guarantee playback. Files must remain publicly reachable with
browser-supported codecs and an appropriate media response from their host.
Expired signed URLs, authentication, hotlink protection, removal and network
failures can prevent playback. YouTube owners can disable embedding; age, region
or account restrictions can also block a video. Each player includes guidance and
an **Open video source** link. The app does not upload, proxy, probe or cache videos.
Do not use private credentials in URLs: saved video URLs are visible to readers.

Privacy-enhanced YouTube embeds still contact YouTube when loaded. Direct players
contact their remote host when played. Neither player starts playback automatically.

## Security and deployment

Insertion, HTML import, persistence and rendering share strict URL checks. Atomic
post saves and working-copy saves reject unsupported video sources. Public and
preview renderers validate saved JSON again and sanitize legacy HTML, accepting
iframes only on supported YouTube embed paths and rebuilding safe player attributes.
No arbitrary iframe attributes or autoplay options are carried through. YouTube
iframes load lazily and receive only encrypted-media, picture-in-picture and fullscreen
permissions. Source links keep `_blank` with `noopener noreferrer` in previews so
opening a source does not navigate away from the editor.

### Legacy HTML compatibility

This release also sanitizes **all public legacy HTML article bodies**, which were
previously rendered unchanged. Existing text, emphasis, links, lists, tables and
images remain supported. Attributes outside the allowlist are removed, including
heading `id` anchors, `title`, table `colspan`/`rowspan`, arbitrary `data-*` attributes,
and CSS outside the supported styles. This can change legacy layouts and fragment
navigation; spot-check older articles before rollout. `_blank` link targets are
preserved safely; named targets are dropped. Stored article content is not rewritten
by rendering.

Legacy `<video><source src="…"></video>` markup is deliberately unsupported.
It is rejected at save boundaries with a reinsertion message and omitted during
HTML import/rendering. Before editing such an article, keep a copy of the original
and reinsert its direct URL through **Insert or edit video**. Supported legacy
video HTML uses `src` directly on `<video>`; arbitrary iframe providers remain
unsupported.

No migration or new environment variable is required. This repository does not
currently emit a Content-Security-Policy header. If a deployment adds one, allow
`https://www.youtube-nocookie.com` in `frame-src` and the chosen HTTPS media hosts
in `media-src`; do not allow arbitrary iframe hosts. The embed uses
`strict-origin-when-cross-origin` referrer policy for YouTube playback compatibility.

## Verification

```bash
pnpm exec vitest run __tests__/lib/editor-video.test.ts __tests__/components/EditorContent.test.tsx __tests__/features/posts/preview.test.ts __tests__/features/posts/persistence.test.ts
pnpm exec playwright test --config=e2e/video-dialog.config.ts
```

The isolated browser suite runs on desktop/mobile with third-party requests
intercepted. It covers insert, edit, remove, undo/redo, validation, keyboard focus,
320px layout, serialized draft reopening, and the real public/preview renderers.
It stores fixture drafts in browser storage; it does not establish database writes
or third-party playback availability. The suite runs in the isolated harness CI group.

Run `pnpm exec playwright test e2e/browser/editor-videos.spec.ts --project=browser`
against a dedicated migrated test stack for actual draft save/reopen and authenticated
preview. The main browser CI suite discovers this test automatically. Check playback of a known embeddable YouTube
video and designated MP4/WebM test assets in the target browsers. Keep automated
checks independent of third-party player availability.

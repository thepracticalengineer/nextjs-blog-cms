# Page Block Editor Implementation Plan

**Goal:** Implement issue #287's reusable Tiptap page canvas, safe document storage, owner-scoped media, and shared preview/public rendering.

**Architecture:** Keep page documents independent of post HTML. Preserve version 1 paragraphs; version 2 wraps a Tiptap JSON document in `{ version: 2, content: { type: 'doc', content: [...] } }`. A dedicated page extension set and renderer share bounded layout attributes and CSS. Existing atomic page writes and snapshot reads use the expanded validator without changing concurrency or publication semantics.

**Tech Stack:** Existing Tiptap 3, React, TypeScript, Zod, PostgreSQL, Vitest, Playwright. No new dependencies.

**Spec:** [Issue #287](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/287). Dashboard workflow and public route delivery remain #288/#289.

## Global constraints

- Node 24.21.0, pnpm 10.29.3; branch from develop, PR against develop.
- Preserve version 1, posts, publication snapshots, optimistic concurrency, retries, private data and media ownership.
- No arbitrary CSS, HTML, script, form or AI blocks. Layout nodes: section, columns, column, button.
- Containers accept width (content/wide/full), background (default/muted/accent), padding and gap (none/sm/md/lg), align (left/center/right). Columns additionally accept preset (one/equal-two/wide-left/wide-right/equal-three), with matching column counts. Columns contain only columns; columns may only occur there. Other containers contain flow blocks.
- Button attributes: label, href, variant (solid/outline), align. Images retain src, alt, width, height, assetId; optional title is supported for Tiptap compatibility.
- Rich text: paragraph, heading (1–6), bulletList, orderedList, listItem, blockquote, codeBlock, horizontalRule, hardBreak, text; bold/italic/strike/underline/code/link marks. Links use http/https/mailto or safe root-relative/fragment destinations.
- Max depth 12, nodes 1500, document UTF-8 bytes 256 KiB, text node 10000 code points. Strict keys and attrs. Images use existing configured image URL allowlist at application boundaries.
- Disposable local database and isolated browser harness only; disable external integrations.

## Review focus

- Invalid/deep/oversized payloads must fail before unsafe recursion or persistence.
- Version 1 text is escaped and migrates losslessly on edit, including empty docs.
- Structural operations preserve valid column counts/nesting, selection, focus and undo.
- Page media paths explicitly authorize pages:update and never broaden library ownership.
- Both editor and renderer stack narrow columns and wrap long text/images without overflow.

## Tasks

- [x] Document contract: add `features/pages/document.ts`, expand `schema.ts`, ordered SQL validator migration, malformed and persistence round-trip tests. Export `PageNode`, `PageDocumentV2`, `toPageEditorDocument(document)`, bounded attribute defaults/options, and `pageDocumentSchema`.
- [x] Media: add page-authorized upload/URL/library request context by reusing existing storage/validation; preserve metadata including assetId through ImageDialog; test role/MFA/owner boundaries and compatibility.
- [x] Canvas: add `features/pages/editor/` extensions, controls and `PageEditor` with document/editorId/onChange props; inserter, nested outline, settings, duplication/deletion, keyboard move and drag, undo/redo, image dialog and private preview.
- [x] Renderer: add shared layout CSS and `PageContent` supporting both document versions; no article prose on layout wrappers; validate before rendering.
- [x] Verification: isolated browser harness for real editor/renderer, round trips, mobile and keyboard; run relevant unit/SQL checks, typecheck/lint/docs checks, review integrated changes, commit/push and create PR against develop.

## Verification evidence

- 1,720 unit tests; 26 page-editor browser cases plus 8 existing post-link and 20 image-dialog cases passed.
- Page SQL assertions and concurrency tests passed in the isolated `cms_issue286` database in `supabase_db_nextjs-blog-cms`; baseline database was not changed.
- 82 CI/reporting tests, TypeScript, zero-warning lint and documentation checks passed.
- Independent integrated and follow-up reviews reported no actionable residual findings.
- Dashboard-to-public-route testing belongs to #288/#289; this delivery uses the real components in an isolated browser harness and real SQL persistence tests separately.

# Owner-only Media Library Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement issue #256 and open a PR against develop.
**Architecture:** Extend the server-only media registry and reuse the existing immutable upload pipeline. Expose owner-scoped HTTP APIs and shared client library components for dashboard and editor.
**Tech Stack:** Next.js App Router, React, existing Base UI components, Supabase/Postgres, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-10-27-media-library-design.md

## Global Constraints

- Node 24.21.0, pnpm 10.29.3; no new runtime dependencies.
- Every asset operation owner-only even for administrators; public URLs unchanged.
- Preserve unrelated work, save/cleanup locks, tombstones, editorial review, existing validation.
- Archive only; no physical deletion endpoint. Library intent is durable.

## Review Focus

- Changed signed-in account must not expose another account's library.
- Storage failure reservations must not appear as reusable assets.
- Duplicate uploads must not overwrite customized metadata or lose durable retention.
- Cleanup must not claim an asset after library selection or archive wins its row lock.
- Out-of-order fetches and double activation must not select or overwrite the wrong asset.

## Task 1: Registry, uploads and owner APIs

Files: new migration, features/posts/media/library.ts and library-types.ts, store.ts, app/api/post-media routes, database/tests/media_library.sql, API tests.

Interface: MediaAsset contains id, url, original_filename (nullable), title, alt_text, caption, description, width/height/byte_size/uploaded_at (nullable), archived_at (nullable). GET /api/post-media/library?editorId=&q=&page=&sort=newest|oldest|title&filter=active|archived returns {assets,total,page,pageSize}. GET/PATCH /api/post-media/library/[id] returns {asset}; PATCH body includes editorId and metadata or archived boolean. POST /api/post-media/library/[id]/select body {editorId} returns {asset} and durably retains under row lock. Upload multipart adds intent=library; completion records successful storage metadata and durable intent, returns existing src,width,height,reused shape. Metadata lengths: filename/title 255, alt 1000, caption 2000, description 5000.

- [x] Write/run failing owner, malformed input, completion, retention and concurrency tests.
- [x] Implement migration, storage completion and bounded authenticated APIs.
- [x] Run API and local disposable database tests and review changes.

## Task 2: Dashboard and editor

Files: features/posts/media/components/*, client.ts, ImageDialog.tsx, dashboard media page/navigation, component and isolated browser tests.

Consumes Task 1 HTTP interface. Upload client accepts optional intent='editor'|'library'. Shared browser fetches only bounded pages, cancels stale requests, pins asset before selection. Detail form and queue preserve errors and retry input.

- [x] Add failing dashboard/picker ownership context and interaction tests.
- [x] Build dashboard, details, upload queue, editor picker and navigation using existing components.
- [x] Run desktop/mobile/keyboard and existing image dialog regressions; review accessibility and races.

## Task 3: Documentation, verification and PR

- [x] Update canonical post-images and testing documentation with migrations, archive, retention, public URLs and backfill semantics.
- [x] Run full units, typecheck, lint, production build, docs and focused SQL/browser tests.
- [ ] Review whole branch, resolve findings, commit, push feat/256-owner-media-library and create/attach PR against develop.

Verification: 1,577 unit tests and coverage thresholds passed; production build, typecheck, lint, documentation checks, 82 CI/reporting tests, 30 isolated media/image browser checks, and disposable SQL/concurrency/upgrade checks passed. Full-stack browser test is added to CI but not executed locally because Auth/Storage services are unavailable. Independent UI and backend reviews are resolved; final assembled review found no remaining blocking issue.

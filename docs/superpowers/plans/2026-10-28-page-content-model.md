# Page content model implementation plan

**Goal:** Implement issue #286's dedicated Pages persistence and authorization contract.

**Architecture:** Private working rows and separate public snapshots. Authenticated atomic RPC derives actor identity, checks admin role/MFA, serializes retries and locks each page; UUID revisions prevent stale writes. No service-role client or post/taxonomy coupling.

**Tech stack:** Existing Next.js, Zod, Supabase/Postgres, Vitest and disposable database assertions.

**Specification:** [Issue #286](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/286).

## Tasks

- [x] Define strict version 1 JSON schema (plain paragraph storage, no editor implementation), page values, operation inputs and admin-only capabilities. Test unsupported versions, unknown fields, bounds and roles.
- [x] Add ordered migration with private pages, public snapshots, private retry receipts and slug reservations. Implement atomic create/save/publish/unpublish with request identity, row locks and opaque revisions. Validate in SQL as well as TypeScript. Assert privacy, MFA, direct-write denial, state preservation and retries.
- [x] Add guarded server actions and snapshot read boundary. Validate unknown content before returning it for future rendering; never coerce unsupported documents or fall back to working data. Test guards, errors and caller-scoped RPC use.
- [x] Exercise concurrent creation/save/retry and slug conflicts using separate database connections. Wire into CI and document schema, permissions and migration-first rollout.
- [x] Run unit tests, database assertions, typecheck, lint and docs checks; review final diff.

## Review focus

Retry after later edits must not overwrite state; changed payload with reused key must fail. Publishing must use the expected working revision. Renaming a draft must not remove its live snapshot or allow another page to steal the published slug. Authors, anonymous callers and enrolled AAL1 admins must never see drafts. Unsupported versions fail closed on both reads and writes.

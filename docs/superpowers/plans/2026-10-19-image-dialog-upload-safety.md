# Issue 168: image dialog and upload safety

**Goal:** Implement https://github.com/thepracticalengineer/nextjs-blog-cms/issues/168 on a branch from main and open a PR against main.

**Design:** Keep the shared cover/inline dialog within the viewport, with a vertically scrolling body and visible footer. Every dismissal of changed input offers Keep editing or Discard changes; busy dismissal explains cancellation. A synchronous request guard prevents repeated activation. Uploads hash normalized WebP bytes on the server. A service-only database reservation serializes each owner/hash and returns one immutable UUID path, compatible with retention and cleanup. Storage uploads never overwrite; concurrent duplicate-object responses reuse the existing path. Older uploads are hashed by a resumable deployment command without deleting or rewriting objects; request-time readiness uses an indexed one-row check. Reuse refreshes the abandonment grace period under the retention row lock; tombstones are never revived.

**Constraints:** Node 24.21.0, pnpm 10.29.3. No production writes, secrets, automatic editorial review, new dependencies, or deletion of existing objects. Preserve ownership and service-only registry access.

## Implementation

- [x] Add failing component and browser tests for long filenames, all dismissal paths, keep/discard, unchanged close, in-progress cancellation, focus restoration, upload failure/retry and reuse feedback. Implement dialog layout and shared dismissal guard.
- [x] Add failing API and rolled-back SQL tests for renamed identical files, concurrent reservations, retries, ownership, legacy reuse and expired media. Add the migration, server helper, and reuse response. Preserve UUID storage paths and existing retention contracts.
- [x] Update canonical image, migration and testing documentation. Run unit suite, typecheck, lint, docs checks, isolated browser suite and disposable database assertions/concurrency checks. Review the diff, commit, push and create/attach a PR against main.

## Review focus

- A pending file must remain protected before upload and after upload success.
- Reverting fields to their initial values should allow immediate closing; an existing decorative inline image must start unchanged.
- Closing during upload must distinguish browser cancellation from possible server completion.
- Storage failures and failed reservations must remain retryable without duplicate objects or unavailable URLs.
- Reuse must not race cleanup, revive tombstones, or reveal another owner's uploads.

## Review and verification evidence

- Independent review found a pending URL-validation save could apply behind the
  discard prompt. A gated validation regression reproduced it; dismissal now aborts
  validation so Keep editing retains editable input and Use image can retry.
- Existing production duplicates are intentionally preserved, as required by the
  issue; combining or deleting those objects is outside this change.

Verification: 1,555 unit tests passed with coverage thresholds; typecheck, zero-warning
lint and documentation checks passed. All 12 database SQL assertion files passed
on an isolated schema clone, plus 20-connection media concurrency. The standalone
shared-dialog browser suite covers desktop and mobile. The database-backed full
post-media browser test was updated for concurrent reuse and explicit discard; its
full Auth/Storage stack is exercised by CI rather than this local schema-only clone.

PR review follow-up: normalize null TipTap alt text, ignore portal paste during
discard confirmation, expose only curated storage errors, move legacy hashing
outside requests with persistent missing-object markers, and align browser
expectations with confirmation and single-object reuse. The auth regression now
waits for the replacement widget effect rather than assuming synchronous setup.

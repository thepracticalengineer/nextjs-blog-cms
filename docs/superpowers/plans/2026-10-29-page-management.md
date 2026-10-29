# Page management implementation plan

**Goal:** Implement issue #288 on develop; public URL routing and View Page remain explicitly dependent on #289, as requested.

**Architecture:** Use the existing admin/MFA guards, page editor and atomic page writes. Add publication readiness and explicit review at the database boundary. Keep unsaved recovery and exact retry payloads in versioned, account-scoped browser storage. Preview stays in the authenticated dashboard with no public preview URL.

**Tech stack:** Existing Next.js App Router, React, Tiptap, Supabase/Postgres, Vitest and Playwright. No dependencies added.

- [x] Add readiness rules, checked publication RPC and regression assertions; preserve snapshot isolation, revision checks and exact replay.
- [x] Add bounded server list queries, authorized routes and sidebar navigation.
- [x] Add editor workflow, explicit review, private preview, duplication, recovery and navigation protection. Persist pending requests before dispatch; never silently overwrite input on replay or stale revisions.
- [x] Verify unit/database/browser flows including mobile and keyboard; run typecheck, lint and docs checks.
- [x] Update canonical documentation and review the final diff.
- [ ] Commit and open a PR against develop.

Review focus: lost create acknowledgements on reload; replay returning newer content; another account's local recovery; stale saves while typing; publication from direct RPC without review. Browser recovery is local to the current browser/account and is not cross-device backup. Public assets retain the existing public URL contract.

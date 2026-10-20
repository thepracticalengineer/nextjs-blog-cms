# Legacy AI and external API retirement implementation plan

**Goal:** Implement issue #209 from develop; retire PDF/chat/full-post generation and external CMS API keys while retaining encrypted owner-scoped providers in Settings.
**Spec:** GitHub issue #209 and its explicitly retained safeguards; #210 provider relocation and #131 isolation are prerequisites included here. #211–214 editor actions are separate future deliveries.
**Architecture:** Keep inert 410 route handlers as compatibility tombstones. Relocate provider credentials to features/ai and cookie/MFA authenticated settings. Keep existing database rows and atomic post persistence; forward migration revokes external keys and retires legacy writes.
**Constraints:** Node24.21.0/pnpm10.29.3; no production changes; preserve encryption secret, authorship, drafts, working copies, privacy, newsletter and publication contracts.

## Task 1: Provider settings and credential isolation
- [x] Add failing tests for owner-specific resolution, no environment fallback, masked GET, author/admin management, invalid bodies, auth/MFA, origin checks, and bounded verification failures.
- [x] Implement features/ai types, credential resolver and provider verification adapters; /api/settings/ai-providers GET/POST/DELETE; /dashboard/settings/ai-providers and settings navigation using installed UI patterns.
- [x] Forward migration keeps ciphertext unchanged, permits author/admin own LLM CRUD, retains MFA and blocks legacy writes. Add rolled-back SQL assertions.
- [x] Verify targeted unit/SQL/browser tests.

## Task 2: Retirement and compatibility
- [x] Add failing matrix tests for every legacy endpoint returning 410 without private/service/provider access for absent/present credentials and malformed bodies.
- [x] Remove assistant/Developer UI and legacy services; keep tombstone handlers and explicit retired-page notices.
- [x] Remove genuinely unused dependencies/config/permissions. Preserve SDKs, encryption, taxonomy store and shared post services.
- [x] Migrate E2E coverage to manual-editor and session contracts, replacing legacy CRUD tests with retirement assertions.

## Task 3: Documentation, integration and PR
- [x] Rewrite canonical feature/API/setup/security/testing/operations guidance, define consumer cutoff, retention/export handling and migration-before-deploy ordering. Preserve historical plans and migrations.
- [x] Run docs checks/regressions, unit coverage, typecheck, zero-warning lint, production build and relevant isolated E2E/SQL checks; record unavailable checks honestly.
- [x] Review whole diff, commit focused conventional changes, push and create PR targeting develop, attach PR.

## Review focus
Cross-user credential access; stale settings requests and double submits; old clients retrying writes after cutoff; retained ciphertext with unchanged encryption secret; accidental removal of internal editor/atomic-save/newsletter behavior. Tests and final review must cover these boundaries.

## Verification record

Node 24.21.0 / pnpm 10.29.3. Typecheck, zero-warning lint, production build, unit coverage thresholds and both documentation checks passed. Retirement HTTP E2E: 66 passed. Synthetic real-Next settings UI: 4 passed on desktop/mobile. Disposable local SQL: populated upgrade preservation, owner isolation/retirement, MFA and existing atomic writes passed. Full real-Auth/browser suite and live providers were not run locally; CI retains the full migrated-stack suite. Independent review found Gemini invalid-key classification, fixed with red/green regression; subsequent security review accepted the browser Host origin normalization.

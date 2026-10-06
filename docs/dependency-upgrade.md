# Dependency modernization

The October 5, 2026 upgrade moves the app to Next.js 16.3.8, React 19.3.0, TipTap 3.31.4, Tailwind 4.3.3, Zod 4.6.5, Supabase SSR 0.12.7/client 2.117.2, and Vitest 5.0.3 with Vite 8.3.2. It updates the other direct dependencies to stable compatible releases and refreshes transitive dependencies. Exact manifest versions and `pnpm-lock.yaml` keep installations reproducible.

## Runtime and installation

Use Node 24.21.0 and pnpm 10.29.3. CI reads `.nvmrc`; Vercel uses its managed Node 24 patch. Node types follow the runtime's major. Run `pnpm install --frozen-lockfile` without peer bypass flags. Keep the pnpm manifest and lockfile together; the npm requirements in the original issue were superseded by PR #64.

`pnpm-workspace.yaml` retains strict peer validation. Only the reviewed ESLint native resolver bootstrap may run an install script. GenAI's published package needs no bootstrap and protobufjs's postinstall only emits version-scheme warnings, so those scripts are explicitly ignored alongside MSW's unused worker-copy script.

## Application migrations

- Route handlers await Promise params. `middleware.ts` becomes `proxy.ts` and retains server-verified users, role checks, and fail-closed MFA. Supabase refresh cookies and the SSR library's anti-cache headers survive redirects. Existing server-side cookie writes remain supported.
- ESLint uses flat configuration and the CLI, including lint-staged. Next 16 no longer lints during builds, so CI runs lint and full type checking explicitly. Type checking includes tests; fixture types and Vitest DOM matcher imports are corrected.
- TipTap's entire dependency family uses one version. Separately configured Link/Underline extensions are disabled in StarterKit, as is automatic trailing-node insertion. The editor delays rendering until the client, uses the v3 `setContent` options, supports external clearing, and cleans up its debounce timer. Saved HTML and JSON retain links, images, tables, task lists, alignment, line height, and formatting.
- Tailwind uses `@tailwindcss/postcss`, CSS theme tokens, typography and `tw-animate-css`. Legacy configuration, autoprefixer, and duplicate animation registration are removed. Renamed utilities preserve v3 shadow, rounding, outline, gradient, and flex behavior. `shadcn/tailwind.css` remains imported; the CLI package moves to development dependencies because the CSS is resolved at build time.
- Zod 4 and resolver 5 work with the existing form/API schemas. React Hook Form subscriptions use `useWatch`. New React lint requirements are addressed without disabling the recommended rule set.
- Gemini uses `@google/genai` for streaming, titles, key validation, and structured post generation. JSON responses request `application/json`; streaming reads the response's text property. New chats offer stable Gemini 3.5 Flash-Lite and 3.8 Flash. Existing 1.5 Flash/Pro IDs map to those replacements without rewriting stored chats. Other provider API interfaces remain compatible with the updated SDKs.
- PDF extraction uses `PDFParse.getText()` and `getInfo()`, with `destroy()` in `finally`. The package is externalized so PDF.js can resolve its worker at runtime. Text cleanup, truncation, metadata, and page counts retain their previous contract.

## Deployment requirements

The image optimizer now allows the configured Supabase public-storage origin and explicitly listed external hosts. Set `IMAGE_REMOTE_HOSTS` to a comma-separated list of HTTPS hostnames used by existing external cover images or avatars. Review stored image origins before deploying; an unlisted optimized image will be rejected. The blanket HTTPS wildcard is removed. Next 16's private-IP restriction, redirect limit and quality defaults remain enabled.

Private routes and auth cookies keep their previous behavior. Cache Components are not enabled; database reads retain request-time behavior. Existing `revalidatePath` calls remain supported. Next 16's Turbopack build is verified. `NEXT_DIST_DIR` can select a separate output directory for local verification to avoid sharing a cache with another server. Agent instructions remain repository-maintained rather than being appended by `next dev`.

## Compatibility and security follow-up

[Issue #65](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/65) tracks the deferred upgrades and residual audit finding:

- ESLint 10.12.0 is blocked by required peer ranges in Next's import, React, and accessibility plugins. ESLint 9.39.5 is the newest compatible release.
- TypeScript 7.0.2 is blocked by `typescript-eslint@8.71.0`, whose required compiler range is `>=4.8.4 <6.1.0`. Next itself supports the TypeScript 7 CLI checker, but the lint parser still needs the JavaScript compiler API. TypeScript 6.0.3 is the newest compatible release.
- The full audit retains one high advisory, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), through Next's development-only ESLint plugin and `braces@3.0.3`. No patched release is available. Deeply nested glob input can exhaust the stack. In this repository it processes repository-controlled lint patterns in local tooling and ephemeral CI runners, with no production request path. Do not feed untrusted user patterns to the tooling. The advisory is recorded rather than suppressed.

Dependabot groups Next, React/types, TipTap, Supabase and test tooling, and updates GitHub Actions weekly. ESLint/TypeScript majors wait for the tracked compatibility fixes; Node types stay on Node 24.

### Monitoring the deferred upgrades

The `Toolchain compatibility follow-up` GitHub Actions workflow runs weekly on Monday at 01:00 UTC (09:00 Manila) and can be run manually. Its job summary and 30-day artifact record the latest compiler, linter, Next lint configuration, parser, relevant plugin and braces registry metadata, including required peer ranges, alongside complete full and production audit JSON. Registry metadata is evidence for review, not an automatic compatibility decision; the Next configuration's dependency ranges and a strict installation must also accept the selected versions.

Both audits run even when the full audit reports a vulnerability. Their original outcomes are recorded, and the workflow fails if either audit command fails; the known advisory is not ignored. This workflow does not change dependency versions or remove the major-version holds. When upstream compatibility or a fix becomes available, update the manifest and lockfile together and rerun all verification below before removing those holds.

The issue #65 investigation rechecked commit `c44d54e` on October 5, 2026 using Node 24.21.0 and pnpm 10.29.3. A clean isolated frozen installation with strict peer validation, full type check, zero-warning ESLint, 451 tests across 53 files with coverage thresholds, and the production build passed. Coverage was 90.49% statements, 80.38% branches, 95.34% functions, and 92.37% lines. The full audit returned one high advisory through the reported braces path; the production audit returned zero findings. The latest registry versions and required peer ranges still matched the blockers above. Simple deeply nested brace-pattern probes did not reproduce stack exhaustion locally; the advisory and audit remain the evidence for the vulnerability. The deferred upgrade acceptance items therefore remain open.

## Verification

A clean frozen installation, full type check, zero-warning ESLint, 451 unit tests across 53 files, coverage thresholds, and Next 16 Turbopack production build pass. Regression tests cover persisted editor content, proxy cookies/headers and MFA, Gemini streaming/JSON, and PDF extraction with both mocks and a real PDF worker.

Audit snapshots after the transitive refresh: production dependencies have **zero findings**; the full graph has **one high finding** described above and no critical, moderate, or low findings. These are pnpm results and should not be compared directly with the earlier npm affected-package count.

Live provider generation requires valid provider keys and was verified through SDK mocks rather than paid API calls. All 19 API cases and five browser flows pass against an isolated disposable local Supabase instance. Browser checks cover public navigation, registration and newsletter subscription, author editing/save/reload/publish, profile updates, real PDF upload/chat creation with a stubbed provider response, and MFA enrollment followed by a fresh login challenge. They assert no uncaught runtime or hydration errors. CI provisions its own disposable local database for the same suite.

## Migration references

- [Next 15](https://nextjs.org/docs/app/guides/upgrading/version-15) and [Next 16](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [TypeScript 7 with Next](https://nextjs.org/docs/app/api-reference/config/next-config-js/useTypeScriptCli)
- [TipTap v3](https://tiptap.dev/docs/guides/upgrade-tiptap-v2) and [Tailwind v4](https://tailwindcss.com/docs/upgrade-guide)
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Google GenAI](https://ai.google.dev/gemini-api/docs/migrate) and [stable models](https://ai.google.dev/gemini-api/docs/models)
- [PDF parser](https://github.com/mehmet-kozan/pdf-parse) and [Vitest 5](https://vitest.dev/guide/migration/)

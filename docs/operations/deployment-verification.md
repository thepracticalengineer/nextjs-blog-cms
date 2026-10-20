# Deployment verification

[Numbered releases](releases.md) identify milestones independently of Vercel deployments. A published GitHub Release does not certify deployment success.

Before deployment, run the [development checks](../development/testing.md) against a disposable environment and confirm [migration prerequisites](../setup/migrations.md). Review deployment logs and environment configuration.

After deployment, inspect home/blog navigation, article pages, taxonomy, public authors and sitemap. Confirm former published URLs redirect directly with 308, while unpublished/deleted destinations return 404. Check auth and recovery redirects/templates, API authorization and publication errors without creating production test content. Inspect newsletter cron logs and queue status; authenticated dispatcher calls may send real emails.

Keep AI output in drafts until a human editor reviews accuracy, attribution, taxonomy and SEO. See [content cleanup and dated audit](content-cleanup.md) and [publication rules](../features/publication-and-slugs.md). Production cleanup and publication require deliberate editorial decisions.

Before enabling Google/GitHub sign-in, configure provider credentials and exact callback allowlists, then complete the dedicated-account [social authentication rollout checklist](../setup/social-auth.md#verification-and-rollout). The mocked SDK/browser tests do not verify live provider consent or account linking.

For signup confirmation, follow the coordinated [application/template/allowlist rollout](../features/signup-confirmation.md#deployment-and-rollback). Verify one-hour expiry, the 60-second Auth send interval, configured-domain links, fresh-browser confirmation, and neutral resend on a designated test project. Local tests do not update or verify hosted settings.

## Analytics rollout

Keep `GA_ENABLED=false` until the [Google Analytics rollout order](../setup/google-analytics.md#rollout-order) is complete. Deploy the disabled implementation first, configure the existing stream for manual collection, then enable only on the canonical production host. Record the collection pause and verification evidence; this deployment alone does not complete issue #129.

## Password policy rollout

Deploy the nonce-capable application before enabling hosted secure password change.
Follow the [password policy requirements and verification](../features/password-recovery.md#deployment-requirements-and-verification), including the eight-character provider minimum, six-digit reauthentication email, password-change notifications, hosted leaked-password protection when supported, legacy login, and recovery/MFA compatibility. Record actual hosted settings and designated-account results with the deployment SHA; local `config.toml` and local passing tests do not verify production configuration.

## Retirement rollout (#209)

Before migration/deployment, record consumer inventory, announced cutoff and completion of caller shutdown/retry draining. Apply the forward migration and retain the provider encryption secret unchanged. Confirm existing developer keys are inactive and legacy AI records remain private and readable/exportable only by their owners, with writes denied. Inventory historical `ai-books` objects privately; do not delete retained data.

After deployment, check `/api/posts`, `/api/posts/create`, `/api/posts/[id]`, `/api/ai-assistant/**` and `/api/developer/**` return `410 API_RETIRED` for missing, invalid and formerly valid credentials. Use disposable environments for mutation-denial and credential tests; do not create production content. Confirm no provider requests or data mutations occur. Verify Settings → AI Providers uses cookies/MFA, shows only the current owner's settings and preserves existing encrypted credentials; do not expose raw keys in evidence. Confirm the standalone assistant and Developer UI are absent and dashboard publication, concurrency, cache invalidation and newsletter behavior still work in the designated test environment.

Record the deployed SHA, migration and verification results. There is no supported grace period. A code rollback does not restore revoked keys; restoring external access requires deliberate key reprovisioning and coordinated consumer/security review. Editor assistance (#211–214) is outside this deployment.

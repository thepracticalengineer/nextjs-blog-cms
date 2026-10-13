# Deployment verification

Before release, run the [development checks](../development/testing.md) against a disposable environment and confirm [migration prerequisites](../setup/migrations.md). Review deployment logs and environment configuration.

After release, inspect home/blog navigation, article pages, taxonomy, public authors and sitemap. Confirm former published URLs redirect directly with 308, while unpublished/deleted destinations return 404. Check auth and recovery redirects/templates, API authorization and publication errors without creating production test content. Inspect newsletter cron logs and queue status; authenticated dispatcher calls may send real emails.

Keep AI output in drafts until a human editor reviews accuracy, attribution, taxonomy and SEO. See [content cleanup and dated audit](content-cleanup.md) and [publication rules](../features/publication-and-slugs.md). Production cleanup and publication require deliberate editorial decisions.

Before enabling Google/GitHub sign-in, configure provider credentials and exact callback allowlists, then complete the dedicated-account [social authentication rollout checklist](../setup/social-auth.md#verification-and-rollout). The mocked SDK/browser tests do not verify live provider consent or account linking.

## Analytics rollout

Keep `GA_ENABLED=false` until the [Google Analytics rollout order](../setup/google-analytics.md#rollout-order) is complete. Deploy the disabled implementation first, configure the existing stream for manual collection, then enable only on the canonical production host. Record the collection pause and verification evidence; this deployment alone does not complete issue #129.

## Password policy rollout

Deploy the nonce-capable application before enabling hosted secure password change.
Follow the [password policy requirements and verification](../features/password-recovery.md#deployment-requirements-and-verification), including the eight-character provider minimum, six-digit reauthentication email, password-change notifications, hosted leaked-password protection when supported, legacy login, and recovery/MFA compatibility. Record actual hosted settings and designated-account results with the deployment SHA; local `config.toml` and local passing tests do not verify production configuration.

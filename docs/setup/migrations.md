# Database migration prerequisites

Apply all ordered `supabase/migrations/` before deploying current application code. Do not bootstrap from the historical schema snapshot alone. Use [local setup](local-development.md) for CLI commands and target selection.

| Migration | Deployment prerequisite |
| --- | --- |
| `20261006140753_add_password_recovery_grants.sql` | Server-only recovery capabilities |
| `20261006152137_limit_recovery_mfa_attempts.sql` | Atomic MFA attempt limits |
| `20261006160738_public_author_profiles.sql` | Public-field projection with private-profile RLS |
| `20261007031057_post_working_copies.sql` | Private editor draft recovery |
| `20261007055822_post_slug_routes.sql` | Reserved URLs and permanent redirects |
| `20261007110518_atomic_post_mutations.sql` | Atomic saves and idempotency receipts |
| `20261007121102_newsletter_delivery_handoff.sql` | Pause dispatcher, migrate, deploy, then resume |
| `20261007155857_post_media_uploads.sql` | Public image bucket, server-only registry, retention and cover alt text |
| `20261012031302_post_list_summaries.sql` | Stored reading time, stable listing indexes and authenticated dashboard pagination RPC |
| `20261012103751_enforce_mfa_assurance.sql` | Restrictive private database/storage MFA policies; deploy before shared session/API guards |
| `20261016080047_auth_abuse_controls.sql` | Shared service-only auth counters; configure HMAC key and trusted ingress before deploying auth actions |
| `20261016090958_auth_abuse_review_fixes.sql` | Failure-only login accounting and recoverable public account challenges; deploy before updated guards |
| `20261019051428_post_media_content_reuse.sql` | Owner-scoped content hashes and service-only atomic media reservations; pause uploads, migrate, run the [media backfill](../features/post-images.md#validation-and-storage), then deploy and resume uploads |
| `20261019140000_comment_reactions.sql` | Private reaction rows, MFA/eligibility RPCs and shared change budgets; migrate before deploying [comment reactions](../features/comment-reactions.md) |
| `20261020070000_article_reactions.sql` | Private article reaction rows, aggregate/own-selection RPCs and change budgets; migrate before deploying [article reactions](../features/article-reactions.md) |
| `20261020134445_retire_legacy_ai_api.sql` | Revoke developer keys, freeze legacy AI writes and retain owner read/export access; inventory consumers, announce cutoff and drain retries before migration/deploy |
| `20261028135854_add_page_document_v2.sql` | Version 2 page block validation while retaining version 1; apply before deploying the [page block editor](../features/pages.md#version-2-block-documents) |
| `20261028101334_add_page_content_model.sql` | Private working pages, public snapshots, admin/MFA authorization and atomic revision/retry contracts; apply before deploying [Pages server functions](../features/pages.md) |

Earlier migrations install the base schema, comments, keys, AI and newsletter tables. Retain their order and migration history. Read [dependency migrations](../dependency-upgrade.md), [password recovery](../features/password-recovery.md), [author privacy](../features/public-author-profiles.md), [slug behavior](../features/publication-and-slugs.md), [atomic write contracts](../api/publication-and-writes.md), and [newsletter upgrade instructions](../features/newsletter.md) before deployment. SQL fixtures in `database/tests/` must run only against migrated disposable databases.

The post-list migration adds a stored generated column, computing reading time for
existing content during migration. It rewrites `posts` and builds indexes; schedule
an appropriate maintenance window for a large database. Apply it before deploying
the list-query changes. Old application code can continue to read/write posts after
the migration. Reading time is derived from content and must not be supplied by
clients. The dashboard RPC uses invoker permissions and retains RLS; the public
author projection is unchanged. See [post list performance](../operations/post-list-performance.md)
for verification and measurements.

## Legacy AI and Developer API retirement (#209)

Before applying `20261020134445_retire_legacy_ai_api.sql`, inventory external consumers, announce their cutoff, stop callers and drain retries. At deployment all retired routes return `410 API_RETIRED`; there is no grace period. The migration revokes existing `api_keys` with `is_active = false`, disables writes to legacy AI tables and historical `ai-books` storage, and retains owner-scoped reads/exports. `llm_provider_keys` remains writable by eligible authors/admins only for their own keys.

No data is deleted: posts (including generated posts and drafts), provenance, idempotency receipts, books, extracted text, chats and messages remain indefinitely pending a separately reviewed owner export/cleanup. Current PDF upload stored extracted text rather than files; privately inventory historical `ai-books` objects. Keep `LLM_KEY_ENCRYPTION_SECRET` unchanged. Application rollback does not reactivate keys and requires deliberate key reprovisioning if external access is restored. See [retirement rollout](../api/developer-api.md#consumer-cutoff-and-rollout).

Run the rolled-back `database/tests/legacy_ai_retirement.sql` assertions against a designated disposable migrated database, together with existing MFA and atomic-post assertions. Never use production for these fixtures.

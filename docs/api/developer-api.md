# Developer API retirement

Issue #209 retires the external Developer API and its dashboard key-management UI. At deployment, `/api/posts`, `/api/posts/create`, `/api/posts/[id]`, `/api/ai-assistant/**` and `/api/developer/**` return HTTP **410 Gone** with code **`API_RETIRED`**, regardless of missing, invalid or formerly valid credentials. These routes perform no successful reads, provider calls or mutations. There is no runtime grace period and no supported headless replacement in this release.

Use the authenticated dashboard editor to manage articles. Provider credentials move to [Settings → AI Providers](../features/ai-assistant.md), using the cookie-authenticated `/api/settings/ai-providers` endpoint with MFA and owner checks. A developer bearer key cannot authorize that endpoint.

## Consumer cutoff and rollout

Before migration or deployment, operators must inventory scripts, CI jobs, integrations and scheduled callers; announce the cutoff to their owners; stop callers and drain queued work and automatic retries. Do not advise consumers to retry a 410 response. Apply the forward retirement migration before deploying the application, then verify 410 responses without creating production content. See [migration prerequisites](../setup/migrations.md) and [deployment verification](../operations/deployment-verification.md).

The migration sets existing `api_keys.is_active = false`; stored hashes and rows remain. Application rollback does not restore those credentials. Any rollback that deliberately restores external access requires an operator-reviewed key reprovisioning plan, consumer coordination and a security review of the restored code.

## Retained contracts and data

Retirement does not delete articles, generated drafts, provenance, idempotency receipts, books, extracted text, chats or messages. Legacy AI data is retained indefinitely with owner-scoped read/export access; writes are disabled. Export/cleanup requires a separately reviewed owner workflow. Keep historical storage private; do not infer an empty `ai-books` bucket from the current uploader's text-only behavior.

The internal [publication and write contracts](publication-and-writes.md) remain in force. Historical API examples and AI plans under `docs/superpowers/` describe retired behavior and are evidence only.

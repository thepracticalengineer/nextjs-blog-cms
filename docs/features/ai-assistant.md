# AI Providers and retired assistant

Issue #209 removes the standalone PDF upload, book chat and full-post generation workflow. The AI Assistant and Developer dashboard entries are retired. It does not implement editor assistance: issues #211–214 track that separate work. Anthropic, Google and OpenAI SDK dependencies remain available for that work.

Authors and administrators manage only their own provider credentials under **Dashboard → Settings → AI Providers** (`/dashboard/settings/ai-providers`). Configure only the providers you need; configuring all providers is unnecessary. `/api/settings/ai-providers` uses verified cookie sessions, the shared MFA guard and owner-scoped authorization. Administrators cannot manage another author's provider keys. Developer bearer keys do not grant access.

Existing encrypted `llm_provider_keys` rows are reused. Keys remain encrypted with AES-256-GCM and are never returned in plaintext. Keep `LLM_KEY_ENCRYPTION_SECRET` unchanged so stored keys remain decryptable. Environment provider keys are not a fallback; each author supplies their own credentials. See [local configuration](../setup/local-development.md).

## Historical content and export

Existing posts, including generated posts and drafts, provenance rows, books, extracted text, chats and messages remain indefinitely pending separately reviewed owner export/cleanup. Retirement disables legacy AI table and storage writes while preserving private owner read/export access. It does not add an export UI or delete data. The current uploader stored extracted text rather than PDF files; operators must still inventory historical objects in the private `ai-books` bucket before making retention decisions. Never make the bucket public.

All old `/api/ai-assistant/**` routes return `410 API_RETIRED` at deployment. See [consumer cutoff and rollout](../api/developer-api.md#consumer-cutoff-and-rollout). Existing generated drafts still require human editorial review and the shared [publication checks](publication-and-slugs.md).

## Explicit credential verification

Verification makes a bounded model-list request only: it never generates content automatically. Successful access reports verified; provider HTTP 401/403 reports invalid; rate limits, provider outages and network failures report temporarily unavailable rather than invalidating a credential. SDK response details and raw keys are never returned or logged. Anthropic/OpenAI probes use a 10-second timeout and zero retries; Google uses the same timeout and one total attempt.

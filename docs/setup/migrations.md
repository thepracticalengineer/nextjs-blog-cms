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

Earlier migrations install the base schema, comments, keys, AI and newsletter tables. Retain their order and migration history. Read [dependency migrations](../dependency-upgrade.md), [password recovery](../features/password-recovery.md), [author privacy](../features/public-author-profiles.md), [slug behavior](../features/publication-and-slugs.md), [atomic write contracts](../api/publication-and-writes.md), and [newsletter upgrade instructions](../features/newsletter.md) before deployment. SQL fixtures in `database/tests/` must run only against migrated disposable databases.

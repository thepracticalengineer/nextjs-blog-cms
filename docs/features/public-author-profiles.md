# Public author profiles

Public article bylines and avatars link to `/authors/<profile UUID>`. Profiles show the author's public name, avatar, biography and website/social links, followed by their published articles, newest first, with 12 articles per page. Authors manage this information in **Dashboard → Profile**.

The `public_author_profiles` view intentionally executes with its owner's privileges so anonymous readers can access the explicitly listed public fields despite private-profile RLS. Supabase Security Advisor's `security_definer_view` finding is expected for this view. Do not switch it to `security_invoker = true`: anonymous author lookups and bylines would lose access. Keep its projection limited to public fields and retain the privacy assertions when changing it.

Apply `20261006160738_public_author_profiles.sql` before deploying this feature. Public post and comment author queries use the `public_author_profiles` view, which deliberately exposes only public fields. Direct private-profile reads are limited to the signed-in owner; administrative account operations use the server-only service client. Anonymous profile-table reads return no rows, and clients cannot change account roles or email addresses through profile updates.

Database privacy assertions run against the disposable Supabase stack in CI and roll back their fixtures. To run them locally against a migrated disposable database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/public_author_profiles.sql
```

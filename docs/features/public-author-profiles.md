# Public author profiles

Public article bylines and avatars link to `/authors/<profile UUID>`. Profiles show the author's public name, avatar, biography and website/social links, followed by their published articles, newest first, with 12 articles per page. Authors manage this information in **Dashboard → Profile**.

Public article pages also show an author sidebar: the first card contains the public name/avatar linked to the author's profile, biography and valid website/social links. Empty optional fields are omitted, blank names fall back to “Author”, and missing or failed avatars use initials. If the public author is unavailable, the article keeps its existing byline fallback and omits the sidebar.

A second “More from <author name>” card contains up to two other published articles from that author, ordered by publication date descending (null dates last), then ID descending to break ties. The current article is excluded in the database query before limiting results. One other article produces one link; no other articles hides the second card. The query selects only IDs, titles and slugs from published posts and never reads private working copies.

At widths of 1024px and above, the cards stack in a right-hand column beside the article. Smaller screens place both cards below the article. Links have keyboard focus styles; avatars are decorative within a link whose visible name identifies the author. External links open in a new tab with an accessible notice.

Run `pnpm exec vitest run __tests__/features/authors __tests__/features/posts/slug-page.test.tsx` for query, fallback, card and page integration checks. Run `pnpm exec playwright test --config=e2e/seo.config.ts` for the existing metadata suite plus sidebar layout at 320, 390, 1024 and 1280 pixels, keyboard navigation, zero/one/multiple other posts, publication/author filtering, current-post exclusion and deterministic ordering. This suite uses a read-only loopback Data API fixture with external integrations disabled; it does not establish live database RLS behavior.

The `public_author_profiles` view intentionally executes with its owner's privileges so anonymous readers can access the explicitly listed public fields despite private-profile RLS. Supabase Security Advisor's `security_definer_view` finding is expected for this view. Do not switch it to `security_invoker = true`: anonymous author lookups and bylines would lose access. Keep its projection limited to public fields and retain the privacy assertions when changing it.

Apply `20261006160738_public_author_profiles.sql` before deploying this feature. Public post and comment author queries use the `public_author_profiles` view, which deliberately exposes only public fields. Direct private-profile reads are limited to the signed-in owner; administrative account operations use the server-only service client. Anonymous profile-table reads return no rows, and clients cannot change account roles or email addresses through profile updates.

Database privacy assertions run against the disposable Supabase stack in CI and roll back their fixtures. To run them locally against a migrated disposable database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/public_author_profiles.sql
```

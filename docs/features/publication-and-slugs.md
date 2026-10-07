# Publication readiness and editorial review

Drafts may have empty titles, bodies or excerpts. A draft becomes public only after
server validation succeeds. Published edits validate the complete resulting article
before changing any live fields or tags; rejected requests preserve the previous
publication and do not queue newsletter emails. The dashboard retains unsaved input
and displays actionable field errors. Its post-list publish action opens the editor
for review instead of publishing immediately.

The shared policy in `features/posts/publication.ts` requires:

- A descriptive title of **10–160 readable characters**.
- A unique slug, up to **200 characters**, using lowercase letters, numbers and
  single hyphen separators. Empty draft slugs are generated automatically.
- At least **200 readable body words**, with practical examples and useful takeaways.
  HTML markup, comments, scripts, styles, TipTap JSON node names/attributes, empty blocks and whitespace entities do
  not count. Inline markup does not conceal placeholder phrases.
- An accurate excerpt of **40–500 readable characters** and an existing author
  whose profile has a non-empty display name.
- No obvious test titles, lorem ipsum, unfinished template instructions or
  placeholder cover or inline images. Articles about testing are welcome: the word “test”
  alone is never grounds for rejection.
- Explicit human editorial review of accuracy, usefulness, attribution, relevant
  taxonomy and consistent SEO metadata. The editor clears the confirmation when
  content changes. Ambiguous flags such as `TODO`, `TBD` or “work in progress” stay
  visible as non-blocking warnings before and after confirmation so a human can review their context. Obvious filler still must be removed.

These thresholds are minimum readiness checks, not measures of accuracy or quality.
An editor must assess originality, sources, appropriate examples, category/tags and
assets before confirming review. SEO title/description may use the site's title and
excerpt fallbacks; editors must check their rendered meaning.

REST `POST /api/posts/create` and `PATCH /api/posts/{id}` require
`"editorial_reviewed": true` when the resulting article is published, including
PATCH requests that omit `status` while editing a published article. This is an
attestation by a human reviewer, not permission for an AI pipeline to assert review
automatically. AI generation routes continue to create drafts and must go through
the same publishing checks. There is currently no scheduled article-publication
flow; any future flow must reuse `validatePublication` and require prior human
review. Newsletter scheduling and dispatch independently check readiness and current
publication state.

Public cache invalidation covers the root layout (home, blog, author and taxonomy
pages), affected old/new article URLs and the sitemap. Changing a slug is deliberate;
the editor locks published URLs until you choose **Change published URL** and
confirm the permanent redirect. REST PATCH requests that change a published slug
must include `confirm_slug_change: true` as well as `editorial_reviewed: true`.
Former published URLs return **308** and resolve directly to the current published
URL. They remain reserved through unpublish/republish; unpublished destinations
return 404, and deleting a post removes its reservations. Title edits and clearing
an existing slug preserve the saved URL.

Slugs are normalized server-side to lowercase letters, numbers and single hyphens,
with a 200-character limit. Automatic new-post slugs follow the title until manually
edited and retry actual unique-constraint conflicts up to 20 times (`-2`, `-3`, …).
Titles with no usable slug characters receive a `draft-<UUID>` fallback. Custom slug
conflicts preserve input and return an actionable `slug` field error (HTTP 409 for
write conflicts); a chosen URL is never silently suffixed.

Apply `supabase/migrations/20261007055822_post_slug_routes.sql` **before deploying**
this code. It backfills current URL reservations without rewriting existing URLs.
Historical URL changes made before this migration cannot be reconstructed.
Reservations and post writes commit together, so a failed reservation leaves the
post unchanged. The route table has read-only public access for published posts;
only the database trigger maintains it.

Verify the database behavior, including concurrent creates and URL hijacking,
with `bash database/tests/verify-slug-routes.sh` (isolated local PostgreSQL). The
browser flow is covered by `e2e/browser/slug-safety.spec.ts` on a dedicated test
Supabase project.

See [API publication and write contracts](../api/publication-and-writes.md) for errors, optimistic concurrency, atomic saves and idempotency.

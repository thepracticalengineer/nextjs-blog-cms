# Public search indexing and metadata

Implements the application-side work for [issue #94](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/94). Search Console access, production rollout and Google's indexing decisions remain external verification; merging this change does not prove that Google has indexed the site.

## URL and metadata policy

Set `NEXT_PUBLIC_SITE_URL` to the trusted public origin (`https://www.thepracticalengineer.online` in production). Metadata, share links, robots and sitemap use that configured origin, never request headers or a Vercel preview hostname. The shared helper strips paths, query strings and trailing slashes from this setting and rejects non-HTTP(S) URLs or embedded credentials. The localhost fallback supports development; production must explicitly configure the public origin.

Homepage, blog archive, published articles, category/tag archives and public author pages declare absolute canonicals, descriptions, Open Graph URL/title/description/image and Twitter cards. The existing 512px logo is a local fallback with a summary card; supplied article covers use a large-image card. Article SEO fields take precedence over title/excerpt; missing descriptions receive a descriptive fallback. Editorial metadata still needs human review. Broken external covers belong to #90; declaring an image does not establish that social platforms can retrieve it.

Paginated archives use their own `?page=N` canonical for valid pages above 1. Invalid, repeated and first-page parameters canonicalize to the base archive. Tracking parameters do not enter canonicals. Author pagination follows the same rule. Renamed article slugs and merged tags retain their existing permanent redirects. No global homepage canonical is placed on the root layout, so auth or private pages cannot inherit it.

## Sitemap and archive decisions

The sitemap includes the homepage, blog index, published articles, and the category/tag/public-author URLs reachable from those published articles. Empty taxonomy archives remain accessible and indexable, but are omitted from the sitemap. Populated archives remain indexable; there is no blanket taxonomy `noindex`. Improve descriptions and editorial usefulness individually rather than treating all archives as low quality.

Queries explicitly filter `status = published`, page in batches of 500 with stable ID ordering, select only discovery fields, and use `public_author_profiles` for authors. They do not read private profiles, working copies or article bodies. Merged tag aliases are excluded, and shared relationships are deduplicated. Database errors fail the sitemap request instead of silently returning a successful partial result. Discovery is dynamic through the request-scoped client; existing publication invalidation also refreshes `/sitemap.xml`. No database migration is required.

Article and taxonomy `lastModified` values derive from published post update timestamps (the latest contributing article for taxonomy). Homepage, index and author entries omit a guessed modification date. A single sitemap is appropriate for the current site; split it with Next.js `generateSitemaps` before approaching the protocol's 50,000-URL/50 MB limit. Concurrent publication during offset pagination is not a transactional snapshot; a later request reconciles changes.

## October 16, 2026 baseline

Read-only production audit before this change:

- Robots and sitemap returned 200. Robots allowed public crawling and disallowed `/dashboard/` and `/api/`.
- All 115 sitemap URLs returned 200: 42 articles, 16 categories, 55 tags, homepage and blog index. None emitted a canonical link in the fetched HTML.
- Titles/descriptions were present and distinct across those URLs, although some descriptions were generic or quoted article text. Seventeen taxonomy archives displayed “No posts yet.”
- Tested HTTP, non-www and trailing-slash variants used 308 redirects toward HTTPS/www without trailing slashes. HTTP/non-www required two hops; no redirect defect was established.
- All 42 articles declared social image metadata. Two sampled image HEAD requests returned 200 and one Medium image returned 403. HEAD rejection alone does not prove a broken platform preview.

These observations are a dated baseline, not post-deployment results or Search Console evidence. No production content, editorial-review flags, settings or sitemap submissions were changed during the audit.

## Verification and deployment handoff

Run:

```bash
pnpm exec vitest run __tests__/app/public-metadata.test.ts __tests__/app/sitemap.test.ts __tests__/app/robots.test.ts __tests__/features/authors/page.test.tsx
pnpm exec playwright test --config=e2e/seo.config.ts
```

CI runs the SEO browser suite and retains its failures/traces in the E2E artifacts. The suite runs the real Next.js app with a read-only loopback synthetic Data API. It checks rendered canonical/social metadata, pagination, tracking parameters, local fallback-image availability, crawler HTML and sitemap consistency. It seeds no database and disables external providers/mail/webhooks. The sitemap unit tests use the installed Supabase SDK with stubbed HTTP responses to verify more than 1,000 rows, publication filtering, deduplication, alias exclusion and later-page database failures. These checks do not prove live RLS behavior or third-party social crawler behavior.

After deployment, verify the public origin env setting, fetch homepage/article/archive HTML as both a browser and Googlebot, inspect canonical/OG URLs, and repeat HTTP/HTTPS/www/non-www/trailing-slash checks. Confirm empty archives are absent and published articles remain present in the live sitemap. Check actual social-platform previews separately; coordinate failing covers with #90.

An account owner must record Search Console evidence for the homepage and representative article URLs:

1. Inspection date, exact inspected URL, indexing verdict, coverage reason, last crawl, and crawl/indexing eligibility.
2. User-declared canonical and Google-selected canonical, plus the live URL test result.
3. Sitemap submission URL, submission/last-read dates, processing status, discovered URL count and reported errors.
4. After deploying fixes, request indexing only where appropriate and recheck after recrawling. Keep issue #94 open until this externally controlled evidence and production verification are recorded.

An empty domain search does not establish that the site is absent from Google's index. Missing canonicals do not alone establish exclusion either; Google can select its own canonical. AI search features require ordinary search eligibility rather than special AI metadata.

References: [Google SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [pagination](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading), [AI features](https://developers.google.com/search/docs/appearance/ai-features).

# Test content and production cleanup


Keep test/seed posts in local or dedicated disposable test projects. Global E2E
setup/teardown reject the known production project. Remote test projects additionally
require `E2E_SUPABASE_PROJECT_REF` matching their Supabase hostname; local stacks are
allowed without it. Never configure E2E credentials for production. AI outputs and
work-in-progress articles belong in drafts until reviewed.

On **October 7, 2026**, a read-only production audit found that
`/blog/hello-this-is-for-test` already returned 404, was absent from the sitemap and
had no surviving post or associated newsletter queue row. All **42** sitemap article
URLs returned 200; an article-body scan found no obvious filler/template phrases.
The database audit also found no published posts matching the obvious test-title or
filler patterns. No production content was changed during this implementation.
This audit detects obvious placeholders and does not replace human quality review.

For future cleanup, use the checked dashboard/API to unpublish unsuitable articles,
then inspect `newsletter_sends` for pending or claimed notifications before allowing
mail dispatch. Verify the old URL, home/blog navigation, relevant tag/category pages
and sitemap in production after deployment. When there is no reviewed replacement,
leave the old URL at 404 rather than publishing filler to fill the gap.

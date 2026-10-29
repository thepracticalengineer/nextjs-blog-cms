# Roadmap

- [x] Comments system
- [x] Newsletter subscriptions with auto-send on publish
- [x] Retire standalone AI PDF/chat/full-post generation and external Developer API/UI (#209), retain encrypted owner provider settings and legacy data
- [ ] Editor assistance (#211–214); not implemented by #209
- [ ] Analytics dashboard
- [ ] Scheduled posts
- [ ] Multi-author collaboration

## Pages and site management

Planned work: [WordPress-style Pages delivery tracker #293](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/293).
These capabilities are not implemented. The initial scope is administrator-managed
informational and landing pages, using the existing Tiptap foundation with sections
and responsive columns. Page access must use explicit permissions rather than
inheriting ordinary authors' post-publishing access.

### Phase 1: Pages MVP

- [x] [Page model and permissions #286](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/286): dedicated page persistence, versioned block content, private working drafts, published snapshots and atomic saves.
- [x] [Section and column editor #287](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/287): block insertion/reordering, layout settings, media integration, responsive preview and matching public rendering.
- [ ] [Public URLs and SEO #289](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/289): reserved application paths, conflict-safe page URLs, redirects, canonical metadata and published-only sitemap entries.
- [ ] [Page management and publishing #288](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/288): dashboard listing, creation, duplication, recovery, private preview, human-reviewed publication and unpublishing.

Build the page model first, then editor and routing support, then integrate the
management workflow. Pages need their own publication checks: article-only word
count/excerpt rules and post newsletter scheduling must not apply. Draft edits to
a published page must remain private until explicitly published.

### Phase 2: Everyday CMS tools

- [ ] [Revisions, trash and hierarchy #290](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/290): comparison/restoration, recoverable deletion, parent/child organization and safe hierarchy URL behavior.
- [ ] [Starter layouts and section patterns #291](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/291): reusable layouts with explicit independent-copy versus shared-section behavior.

### Phase 3: Site management

- [ ] [Navigation, homepage and site styles #292](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/292): page-ID-based menu links, homepage selection, bounded global styles and controlled header/footer editing.

Coordinate with reader-navigation issue #92, curated destinations #95, SEO #94 and
signup policy #111. This roadmap does not include arbitrary theme/plugin execution,
a new contact-form backend or a full WordPress replacement. Implementation must
preserve post behavior, private drafts, media ownership, publication review,
concurrency protection and URL reservations; verify accessibility and mobile layouts.

The former Developer API, headless CMS API and standalone AI assistant are retired features, not supported entry points. See [retirement](../api/developer-api.md) and [AI Providers](ai-assistant.md).

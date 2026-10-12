# Google Analytics

This guide implements the collection foundation for [issue #129](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/129). Property administration and production verification remain rollout work; a merged PR alone does not complete the issue. Growth reporting belongs to [issue #93](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/93).

## Existing property and audit

Read-only audit on October 12, 2026:

| Setting | Observed value | Rollout action |
| --- | --- | --- |
| Account / property | CMS Blog / next-cms-blog (528780266) | Preserve property/history |
| Web stream | blog (13920473767), `G-GK3VZYJV1C` | Verify deployed ID |
| Stream URL | `https://blog.frankmendez.site/` | Confirm and update to `https://www.thepracticalengineer.online/` |
| Data collection | Active within 48 hours | Verify production hostnames and payloads after rollout |
| Enhanced measurement | All seven options on, including browser-history pageviews | Turn off enhanced measurement before activating this implementation |
| Key events | `qualify_lead`, `close_convert_lead`, `purchase`; no stream data detected | Use the genuine subscription outcome; unmark unused lead events; leave locked purchase setting alone |
| Internal Traffic exclusion | Testing | Validate definitions/matches before activation |
| Retention | Events: 2 months; users: 14 months, reset on activity | Review 14-month event retention against agreed policy; expired data cannot be restored |
| Redaction | Email on; query keys off | Keep email redaction and configure actual sensitive query keys |

The stream URL is metadata, not a hostname allowlist. Update it without creating a replacement property. Verify old-domain redirects preserve approved campaign parameters; use cross-domain linking only for an actual multi-domain journey.

## Deployment gate

Collection requires **all** of the following server configuration:

```dotenv
NEXT_PUBLIC_SITE_URL=https://www.thepracticalengineer.online
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-GK3VZYJV1C
GA_ENABLED=true
# Vercel supplies VERCEL_ENV=production automatically.
# For a self-hosted production build only:
DEPLOYMENT_ENV=production
```

`NODE_ENV` must also be `production`. A Vercel preview remains excluded even if `DEPLOYMENT_ENV=production`. The site URL must be a canonical HTTPS origin, with no credentials, port, path, query, or fragment; localhost, numeric IPs, and Vercel preview domains are rejected. The runtime additionally requires the browser origin to match exactly. Never set the rollout switch in local/test environments. Rebuild and redeploy after environment changes so prerendered routes use consistent configuration.

Leaving `GA_ENABLED` unset disables collection even if an old measurement ID is still configured. This intentionally prevents deploying manual collection alongside the existing automatic setup. Keep this switch off until the following rollout steps are complete.

## Rollout order

1. Review the implementation and run the isolated tests below. Deploy with `GA_ENABLED` unset/false; record the start of the collection pause.
2. In the existing stream, disable **Enhanced measurement** entirely, including browser-history pageviews, forms, search, outbound clicks, scrolls, videos, and downloads. `send_page_view: false` only disables the config-generated pageview; it does not disable enhanced history tracking. The application now owns sanitized pageviews, outbound clicks, and 90% scroll events. Do not layer GTM, another snippet, connected tags, or automatic tracking on top.
3. Update stream metadata; verify property timezone, currency, and industry. Retain email redaction and add sensitive query-key redaction as defense in depth (for example actual OAuth/recovery `code`, `token`, `token_hash`, `access_token`, `refresh_token`, and unsubscribe keys). The application rejects URLs with unknown keys before loading/sending; redaction is not the primary protection.
4. Configure `newsletter_subscribe` as a key event. Unmark unused lead lifecycle events when confirmed irrelevant, and hide unused sales/lead-loss report cards. Do not synthesize events to populate a report. Do not try to override the locked purchase toggle.
5. Review internal-traffic definitions with known staff/test traffic in Testing; activate only after validating no legitimate audience is excluded. Active exclusion is irreversible for newly collected data and does not repair old reports. Establish a developer/debug traffic policy before live verification. Review event/user retention separately; approve the duration before changing it.
6. Verify Search Console ownership/linking and external campaign conventions. Use lowercase, non-personal campaign slugs such as `utm_source=newsletter&utm_medium=email&utm_campaign=architecture-october`; never place UTMs on internal navigation. The runtime allows only bounded alphanumeric/underscore/hyphen campaign values.
7. Set `GA_ENABLED=true` for production and redeploy. Verify one tag, one event per intended action, consent behavior, and sanitized payloads on the canonical hostname. Use a designated test property for synthetic traffic; production verification must not create test subscriptions or pollute reader data.
8. Record rollout time, settings changes, and verification evidence in the issue. Separate pre-rollout unfiltered traffic from subsequent data in #93. Re-enable collection only after completing the checklist; rollback is `GA_ENABLED=false` plus redeployment (existing open tabs require reload). Do not restore the old global tag as a rollback.

No GA4 Admin, hosting environment, or production deployment changes were made as part of the code implementation. Internal filter definitions, Search Console links, hostnames, and live delivery still require verification.

## Consent and collection boundary

The preference strip offers equal-weight allow/reject actions and a persistent turn-off control on supported public pages. Google is not requested before an affirmative choice: this is basic opt-in collection, not cookieless measurement before consent. Advertising storage, ad user data, ad personalization, and Google signals remain disabled. The versioned preference lasts 180 days in local storage; blocked storage falls back to the current document only.

Only successful home, article listing, article, category, and tag pages register for collection. Auth, recovery, dashboard/editor/AI/admin, API, newsletter unsubscribe, author identity URLs, errors, and unmatched pages do not register. New public route types require explicit review and registration. Article titles come from the resolved public page rather than a possibly stale/private `document.title`.

The root runtime disables the Google tag synchronously before history mutations and on back/forward, hash changes, page hiding, page cleanup, and consent withdrawal. A registered public page can resume it after navigation commits. Each event also rechecks the current origin, URL, page registration, and consent. A script that finishes loading late does not replay the page/events that existed when loading began. Withdrawal disables sending and clears accessible `_ga` cookies; it does not delete already collected Google data.

The old Next.js `GoogleAnalytics` wrapper was replaced because its installed API does not expose `send_page_view`, consent defaults, or sanitized configuration. This remains one `gtag.js` installation using the existing stream, not a migration to GTM or Measurement Protocol. Google can still generate normal lifecycle events after opt-in; validate those in the designated property as well. Turning enhanced measurement off is a required operational prerequisite, not a setting the browser can independently prove.

## Event contract

| Event | Trigger and deduplication | Parameters / meaning |
| --- | --- | --- |
| `page_view` | Successful registered public page after opt-in and tag readiness; once per committed URL visit; back/forward counts a new visit | Sanitized `page_location`, public `page_title`, sanitized `page_referrer` |
| `scroll` | Once per measured page visit when a scroll reaches 90% of a scrollable document | `percent_scrolled=90` |
| `click` | Outbound HTTP(S) anchor click on the currently measured page | `outbound=true`, `link_domain`, origin-only `link_url`; no link text/path/query/fragment |
| `newsletter_submit` | Valid form attempt; concurrent submits suppressed | `placement=article_footer`; retry after a failure is another attempt |
| `newsletter_subscribe` | Successful **201** response for a newly persisted subscription, while still on its originating page and consented | Same placement; primary key event |

A **200** response covers already-active and reactivated subscribers and is never counted as a new subscriber. The existing API already exposes the 201/200 distinction; this adds no new subscriber lookup/outcome field. Insert uniqueness ensures only the winning new insert returns 201. No analytics event receives the email, request body, database ID, or unsubscribe token. The flow has no double opt-in: `newsletter_subscribe` means persisted, not verified email ownership. `newsletter_confirmed` and reactivation events are not implemented.

First-party subscription records remain authoritative. Consent, ad blockers, late script loading, lost responses, and leaving the originating page may undercount successful subscriptions. Dropped events are intentionally not buffered/replayed across consent or navigation boundaries. GA counts must not be presented as a complete database total.

Only `page` and bounded campaign parameters are retained in measured page URLs. `q` is dropped completely, and any other query key or fragment excludes the page. External referrers retain only the origin; private/internal referrers are omitted, with subsequent measured public navigation using the previous sanitized page URL. Author identity URLs are excluded rather than reporting profile IDs or names.

### Search and remaining measurement

The current header navigates to `/blog?q=...`, but `app/(public)/blog/page.tsx` and `getPublishedPosts` do not apply that query. Do **not** emit `view_search_results` until a genuine public search implementation exists. Track that prerequisite with #129/#93. Search text is omitted from analytics even on such URLs.

File-download and video measurement are deferred pending an allowlisted event contract; generic collection can include sensitive paths or parameters. Outbound resource clicks currently report destination **domain**, not individual repository paths. Add vetted resource identifiers if article-level distribution reporting needs more detail, rather than forwarding arbitrary URLs.

## Verification

```bash
pnpm exec vitest run __tests__/analytics __tests__/api/newsletter/subscribe.test.ts
pnpm exec playwright test --config=e2e/analytics.config.ts
pnpm run typecheck
pnpm run lint
pnpm run docs:check
```

Unit/component tests exercise production gating, URL/referrer minimization, consent/withdrawal, delayed loading, private navigation, newsletter new/existing/reactivated/failure responses, and duplicate pending submits. The standalone Playwright harness runs the real analytics runtime on desktop and mobile with a stubbed Google loader and all external requests blocked. It uses no database, mail, credentials, or production writes. It verifies browser history, outbound sanitization, and blocked-loader behavior; it does **not** prove Next.js rendering integration or actual Google ingestion.

Before enabling production, use a designated property and isolated app environment for the complete rendered-app matrix: initial page, public navigation, back/forward, public → dashboard → public, token-bearing URL, 404/error, accept/reject/withdraw/re-allow, another-tab withdrawal, scroll, outbound links, and newsletter outcomes. Test actual newsletter writes only against the disposable database described in [testing](../development/testing.md), with external mail/webhooks disabled. Check both browser requests and GA Realtime/DebugView, including automatic lifecycle events, for duplicates and sensitive data. Then verify normal production traffic separately without manufacturing subscriptions.

References: [manual pageviews](https://developers.google.com/analytics/devguides/collection/ga4/views), [Google tag privacy controls](https://developers.google.com/tag-platform/security/guides/privacy), [data redaction](https://support.google.com/analytics/answer/13544947?hl=en), [data filters](https://support.google.com/analytics/answer/10108813?hl=en).

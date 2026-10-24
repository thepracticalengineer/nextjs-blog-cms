# Changelog

## [3.1.0](https://github.com/thepracticalengineer/nextjs-blog-cms/compare/v3.0.1...v3.1.0) (2026-10-24)


### Features

* **auth:** add resumable onboarding for new accounts ([e89e49f](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/e89e49f570722d0f5eea5602058d0d7c5f2362f1))
* **auth:** add resumable onboarding for new accounts ([84b1b32](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/84b1b329544001b6325adbd1cacf1ce4fdceada2))
* **posts:** add bulk delete and unpublish actions ([#224](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/224)) ([e2fab66](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/e2fab668867dc245c63f402c480047f242ac1064))


### Bug Fixes

* **auth:** address onboarding review and MFA checks ([9e9fc07](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/9e9fc07166b5d10ff0c72601120a18503833a704))
* **release:** acknowledge audited historical retirement commits ([#247](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/247)) ([7fc37e6](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/7fc37e6701ee68d53434bf1747bfd450aa942300))
* **release:** align generated branch and trusted policy contracts ([e88be7d](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/e88be7de9b5beaa4e01092c00ad9a4b546e7cbd1))
* **release:** align generated branch and trusted policy contracts ([9f71cd7](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/9f71cd7803ffa8845c56ddc50f8f52779e0587b2))
* **release:** classify policy harness as test-only code ([d03ea6e](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/d03ea6ed2f61fcea369ae2b755254e2788c3c9b9))

## [3.0.1](https://github.com/thepracticalengineer/nextjs-blog-cms/compare/v3.0.0...v3.0.1) (2026-10-21)


### Bug Fixes

* **release:** accept generated root release PR branch ([#232](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/232)) ([f45fe20](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/f45fe20318c73a302bc86d50558c864ed3af4630))

## [3.0.0](https://github.com/thepracticalengineer/nextjs-blog-cms/compare/v2.0.0...v3.0.0) (2026-10-21)


### ⚠ BREAKING CHANGES

* **promotion:** External CMS and legacy AI endpoints now return 410 API_RETIRED. Stop consumers and apply the forward retirement migration before deploying. Revoked CMS keys do not reactivate on application rollback.

### Miscellaneous

* **promotion:** promote develop to main ([#225](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/225)) ([49e8a93](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/49e8a93ad20dda2c62710298e1e5cad3f05e6e9f))

## [2.0.0](https://github.com/thepracticalengineer/nextjs-blog-cms/compare/v1.1.0...v2.0.0) (2026-10-20)


### ⚠ BREAKING CHANGES

* **promotion:** External CMS and legacy AI endpoints now return 410 API_RETIRED. Stop consumers and apply the forward retirement migration before deploying. Revoked CMS keys do not reactivate on application rollback.

### Miscellaneous

* **promotion:** promote release workflows and legacy API retirement to main ([#220](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/220)) ([eb44b22](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/eb44b22ba7c8e5c42e85a90967122c674639f0cc))

## [1.1.0](https://github.com/thepracticalengineer/nextjs-blog-cms/compare/v1.0.0...v1.1.0) (2026-10-20)


### Features

* **articles:** add authenticated emoji reactions ([2d4db58](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/2d4db585cc6e210323d313f503c68fb931fa8bf8))
* **articles:** add authenticated emoji reactions ([7cda473](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/7cda4731d6f83ae2ee78094189111d01a9658e4c))


### Bug Fixes

* **articles:** keep reaction recovery controls reachable ([309e1f5](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/309e1f5c3e8d83f64c44d6d08aaba5d9a852d8b5))

## Changelog

Release Please maintains entries for numbered releases after the existing 1.0.0
application baseline. Historical changes through commit
`9fd450506d6a0d54ed022748d53ca31db2b79e16` are intentionally excluded; no
historical 1.0.0 tag or GitHub Release is implied.

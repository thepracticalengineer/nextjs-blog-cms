# Changelog

## [3.3.0](https://github.com/thepracticalengineer/nextjs-blog-cms/compare/v3.2.0...v3.3.0) (2026-10-27)


### Features

* **dashboard:** organize Posts navigation into an accessible submenu ([3adaa0a](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/3adaa0a72cf211397af841b09fa512b33debbcda))
* **editor:** add YouTube embeds and direct video URLs ([#283](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/283)) ([27caef1](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/27caef1104477cc9583ba7a728a3a9af8f834546))
* **editor:** enable native spelling assistance ([#281](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/281)) ([bb59e93](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/bb59e93f3a85124f3f9613cbf9320318832cf283))

## [3.2.0](https://github.com/thepracticalengineer/nextjs-blog-cms/compare/v3.1.2...v3.2.0) (2026-10-27)


### Features

* **media:** add owner-only media library ([7d72ad0](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/7d72ad0ddc5ebb73be0448aa03522aa845b8b4a4))
* **media:** add owner-only media library ([288e58a](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/288e58aca6e53250780d845e7d727545e2509a63))


### Bug Fixes

* **media:** address library review findings and security check ([4ce0c8b](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/4ce0c8b5dc997841630fcee0c5ad01616ded87a8))

## [3.1.2](https://github.com/thepracticalengineer/nextjs-blog-cms/compare/v3.1.1...v3.1.2) (2026-10-26)


### Bug Fixes

* **posts:** display full article cover images ([02cde8d](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/02cde8d4f4536b91e374ff81bf384bb991959b63))
* **posts:** display full article cover images ([13a30a6](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/13a30a618adb689a3ff748e9ff19ebc15605f3c2))

## [3.1.1](https://github.com/thepracticalengineer/nextjs-blog-cms/compare/v3.1.0...v3.1.1) (2026-10-26)


### Bug Fixes

* **auth:** normalize OAuth error returns and clarify recovery ([7ad87fc](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/7ad87fc6390a7a620086a3ed171654700bda065b))
* **auth:** normalize OAuth error returns and clarify recovery ([fb0da84](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/fb0da8450a47525d631ca50028b49df5ba5c77fa))
* **auth:** preserve failed OAuth destinations and isolate test ports ([17b43cd](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/17b43cd986289aa36b140c652313a492baa52086))
* **editor:** replace native link prompt with accessible dialog ([#255](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/255)) ([4745837](https://github.com/thepracticalengineer/nextjs-blog-cms/commit/47458378796943fbe1fa4c57e9acc4a49ff89285))

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

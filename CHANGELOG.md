# Changelog

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

# Documentation

[Project overview and quick start](../README.md) · [Coding-agent instructions](../AGENTS.md)

## Setup

- [Local development and environment variables](setup/local-development.md)
- [Database initialization and migration prerequisites](setup/migrations.md)
- [Deployment configuration](setup/deployment.md)
- [Google Analytics setup and rollout](setup/google-analytics.md)
- [Google and GitHub authentication](setup/social-auth.md)
- [Supabase confirmation webhooks](setup/webhooks.md)

## Development

- [Agent skills, installation, maintenance and Next.js references](development/agent-skills.md)
- [AI and MCP workflows](development/ai-workflows.md)
- [Unit, database and E2E testing](development/testing.md)
- [Dependency management and upgrade evidence](dependency-upgrade.md)
- [Contribution workflow and code of conduct](development/contributing.md)

## API

- [Authentication, endpoints and examples](api/developer-api.md)
- [Publication errors, concurrency, atomic saves and idempotency](api/publication-and-writes.md)

## Features

- [Authentication abuse controls and deployment prerequisites](features/auth-abuse-controls.md)

- [Client auth state, profile requests and retry](features/client-auth-state.md)
- [Comment reactions](features/comment-reactions.md)
- [Roles and permissions](features/roles-and-permissions.md)
- [AI writing assistant](features/ai-assistant.md)
- [Newsletter subscriptions, retries and cron](features/newsletter.md)
- [MFA verification, retries and lost authenticators](features/mfa.md)
- [Password recovery and MFA](features/password-recovery.md)
- [Signup confirmation and resend](features/signup-confirmation.md)
- [Public author profiles and privacy](features/public-author-profiles.md)
- [Cover and inline images](features/post-images.md)
- [Publication readiness, editorial review and slug behavior](features/publication-and-slugs.md)
- [Screenshots](features/screenshots.md)
- [Roadmap](features/roadmap.md)

## Operations

- [Numbered releases, Release Please setup and recovery](operations/releases.md)

- [Search indexing, canonical metadata and issue #94 verification](operations/search-indexing.md)
- [Deployment verification](operations/deployment-verification.md)
- [Production cleanup and October 7, 2026 audit](operations/content-cleanup.md)
- [Post list performance and issue #77 verification](operations/post-list-performance.md)
- [Issue #85 setup verification](operations/issue-85-verification.md)

## Historical plans and specifications

`superpowers/` preserves original decisions and commands; use the guides above for current setup.

- PDF extraction: [plan](superpowers/plans/2026-04-14-openai-pdf-text-extraction.md).
- Playwright API suite: [plan](superpowers/plans/2026-04-15-playwright-api-e2e.md), [specification](superpowers/specs/2026-04-15-playwright-api-e2e-design.md).
- Confirmation notifications: [plan](superpowers/plans/2026-04-16-user-confirmed-notification.md), [specification](superpowers/specs/2026-04-16-user-confirmed-notification-design.md).
- Author profiles: [plan](superpowers/plans/2026-04-17-profile.md), [specification](superpowers/specs/2026-04-17-profile-design.md).
- Landing page: [plan](superpowers/plans/2026-04-20-landing-refactor.md), [specification](superpowers/specs/2026-04-20-landing-refactor-design.md).
- Newsletter: [plan](superpowers/plans/2026-04-21-newsletter-subscription.md), [specification](superpowers/specs/2026-04-21-newsletter-subscription-design.md).

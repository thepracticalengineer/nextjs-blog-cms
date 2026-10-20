# Development MCP servers

This project is optimized for AI-assisted development using MCP servers:

- `github-mcp` — repo management, PRs, commits
- `supabase-mcp` — database schema, queries, RLS
- `vercel-mcp` — deployments and env management
- `filesystem-mcp` — file editing and refactoring
- `browser-mcp` — UI testing and debugging
- `postgres-mcp` (optional) — query optimization

These are optional development integrations, not application runtime requirements or a replacement for the retired external Developer API. They do not restore standalone AI generation. Application provider credentials belong to Settings → AI Providers; editor assistance (#211–214) is separate future work. `.mcp.json` is ignored and machine-specific credentials/configuration must stay local. Use repository [AGENTS.md](../../AGENTS.md) and [project skills](agent-skills.md) with Codex; [CLAUDE.md](../../CLAUDE.md) imports the same guidance for Claude Code. Grant integrations only the access needed for the task. Database/browser verification uses disposable environments; AI-generated content remains draft until human editorial review.

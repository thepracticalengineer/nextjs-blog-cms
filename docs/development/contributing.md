# Contributing

Contributions are welcome. To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes with clear messages
4. Open a Pull Request — describe what changed and why

For significant changes, open an issue first to discuss the approach.

Use the pinned Node/pnpm versions, focused branches, and preserve unrelated changes. Run checks appropriate to the changed behavior and describe validation in the PR. Update canonical guides with behavior/setup changes. Commit `package.json` and `pnpm-lock.yaml` together; use `pnpm add` rather than generating npm lockfiles. Review dependency scripts in `pnpm-workspace.yaml`; do not bypass strict peers. See [dependency management](../dependency-upgrade.md) and [agent instructions](../../AGENTS.md).

# Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you agree to uphold a respectful and inclusive environment. Report unacceptable behavior to the project maintainer.

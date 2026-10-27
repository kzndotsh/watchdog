# Contributing to Watchdog

Watchdog is a self-hosted platform for small OSINT teams: Evidence is collected, Caps propose what it means, and a person accepts what reaches the Case Graph. It is a TypeScript and Postgres monorepo (`apps/`, `packages/`) and is pre-1.0. The [README](README.md) explains the product; [`AGENTS.md`](AGENTS.md) holds the commands and conventions (it is written for coding agents, and it is the shortest reference for people too).

Everyone taking part follows the [Code of Conduct](.github/CODE_OF_CONDUCT.md).

## Set up

You need Node 22 (22.19 or newer), pnpm (the exact version is `packageManager` in `package.json`), [just](https://just.systems), Docker with Compose, and `psql` 18. [`how-to/local-dev.md`](docs/how-to/local-dev.md#setup-without-nix) lists exact versions and the steps.

- **With Nix:** `nix develop` gives you all of it and installs the git hooks.
- **Without Nix:** follow [setup without Nix](docs/how-to/local-dev.md#setup-without-nix). `pnpm install` installs the hooks too.

Then `just env`, `just dev`, and `just admin --email you@example.com` for the first account. The [local development guide](docs/how-to/local-dev.md) covers ports, services and common fixes.

## Run the checks

Before you push, run `pnpm check`, `pnpm typecheck` and `pnpm test`. The git hooks run the fast checks on every commit; CI is the merge gate. What each gate does, and which run where: [`ci-gates.md`](docs/contributing/ci-gates.md). How tests are written: [`testing/standards.md`](docs/contributing/testing/standards.md). Integration and e2e tests need a local Postgres and S3 (`just test-db`); CI runs them if you cannot.

## Pull requests

- Open an issue first for anything bigger than a small fix, so we agree on the shape before you write it.
- Keep a pull request to one change. Small pull requests get reviewed; large ones wait.
- Branch from `main`, and open a ready (not draft) pull request against it. Do not commit to `main`.
- Use [conventional commits](https://www.conventionalcommits.org): `feat(core): ...`, `fix(web): ...`, `docs: ...`. Link the issue in the pull request body.
- Do not skip the hooks (`--no-verify`). If one fails, fix the cause.
- Code that `scripts/doc-map.mjs` maps to a doc must change that doc in the same pull request. When no doc applies, put `docs:allow-affect — <reason>` in the message of that commit.
- Keep investigation content (real names, targets, Case data) out of code, tests, docs and fixtures. Use synthetic data.

The pull request template has the checklist.

## Contributor License Agreement

Watchdog is licensed under [AGPL-3.0-only](LICENSE). Every contributor also agrees to a [Contributor License Agreement](CLA.md) (CLA), which lets the project offer a commercial license alongside AGPL for organizations that cannot use it (see the README's License section). It is a license grant, not a copyright assignment: you keep your copyright.

**Individuals:** before your first pull request is merged, comment on it exactly: `I have read the CLA in CLA.md and agree to it`. The comment is your signature, and it covers your later pull requests from the same GitHub account. The maintainer checks for it by hand before merging; an automated check is planned in [#328](https://github.com/kzndotsh/watchdog/issues/328).

**On behalf of an employer:** your employer signs [`CLA-corporate.md`](CLA-corporate.md) instead. Contact the owner, [@kzndotsh](https://github.com/kzndotsh) on GitHub, to arrange it.

## Report a security issue

Do not open a public issue. Use GitHub's private **Report a vulnerability** form, as described in [`SECURITY.md`](.github/SECURITY.md).

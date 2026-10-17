# Security policy

## Supported versions

Watchdog is pre-1.0 and has no tagged releases. Only the latest commit on `main` is supported; fixes land there and are not backported.

## Reporting a vulnerability

Report privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** (or use <https://github.com/kzndotsh/watchdog/security/advisories/new>). Do not open a public issue or pull request for a vulnerability.

> Maintainer note: this route only works while private vulnerability reporting is enabled in the repository settings (Settings, Code security, Private vulnerability reporting). It is a repo setting, not a file in this repository.

You can expect an acknowledgment within 7 days. After that we will triage, ask for details if needed, and tell you when a fix is on `main`. Please give us time to ship a fix before disclosing publicly.

## What to include

- The affected package or app (`apps/*`, `packages/*`) and the commit you tested.
- Steps to reproduce, or a proof of concept, using synthetic data.
- The impact you expect (what an attacker gains) and any suggested fix.

## Scope

In scope: the platform code in this repository (web app, API, worker, CLI, packages, CI and build configuration).

Out of scope: investigation content, which is not stored here, and any specific self-hosted instance. Do not test against instances you do not operate, and do not publish findings about a particular instance. Never include real Case content, Evidence or credentials in a report.

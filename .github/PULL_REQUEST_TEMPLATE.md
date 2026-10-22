## Linked issue

Closes #

## Summary

<!-- What changed and why. -->

## Checklist

- [ ] Tests added or updated for the change
- [ ] `pnpm check`, `pnpm typecheck` and `pnpm test` pass (`pnpm test:integration` too when `packages/db`, `api`, `core` or `caps` changed)
- [ ] Docs updated where `scripts/doc-map.mjs` maps the changed code, or the commit message carries `docs:allow-affect — <reason>`
- [ ] No machine writes to the Case Graph or sets `confirmed`; secrets go through the vault; no investigation content in code, docs, fixtures or logs
- [ ] CLA: I have commented `I have read the CLA in CLA.md and agree to it` on this pull request (first pull request only; employers sign `CLA-corporate.md`; see [CONTRIBUTING.md](../CONTRIBUTING.md))

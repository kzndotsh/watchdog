## Linked issue

Closes #

## Summary

<!-- What changed and why. -->

## Gates run

- [ ] `pnpm check`
- [ ] `pnpm typecheck` (source and tests)
- [ ] `pnpm test`
- [ ] `pnpm test:integration` (when `packages/db`, `api`, `core` or `caps` changed)
- [ ] `pnpm check:docs:strict`
- [ ] `pnpm check:agents:strict`
- [ ] `pnpm knip`

## Docs affected

- [ ] Yes: updated the docs `scripts/doc-map.mjs` maps to the changed code
- [ ] No: the commit message carries `docs:allow-affect — <reason>`

## Custody checklist

- [ ] No machine writes to the Case Graph (Caps propose; Triage Accept writes)
- [ ] Nothing machine-sets `confirmed`
- [ ] Secrets go through the vault (`ctx.getCredential`), not env or `Job.input`
- [ ] No investigation content in code, docs, fixtures or logs

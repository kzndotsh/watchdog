# Watchdog web (`@watchdog/web`)

> Scope: `apps/web` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

TanStack Start UI. UI contracts live in **[`docs/reference/web/`](../../docs/reference/web/README.md)** (it wins over this file); web traps are indexed at [`README.md#traps-index`](../../docs/reference/web/README.md#traps-index). Design direction: [`DESIGN.md`](../../DESIGN.md).

## Commands

| Task | Command |
| --- | --- |
| Dev | `pnpm dev:web` |
| Typecheck | `pnpm --filter @watchdog/web typecheck` |
| DS bans | `pnpm check` (oxlint `watchdog/no-decorative-class`, `watchdog/no-banned-surface-name`, `watchdog/no-opaque-id-slice`, `watchdog/no-button-height-class`) |
| Unit tests | `pnpm test:unit` (includes the `web-unit` project: `apps/web/src/**/__tests__/**/*.test.ts`) |
| Component tests | `pnpm test:component` |
| E2E | `pnpm test:e2e` · `pnpm test:e2e:smoke` · `pnpm test:e2e:journey` |
| Generate routes | `pnpm generate-routes` |
| Build | `pnpm build` |

## Rules

| Rule | Enforced by |
| --- | --- |
| Primitives: vanilla from `@watchdog/ui/components/*`, wrapped ones from `@/shared/ui/primitives/*` (the wrapped list is derived in `oxlint.config.ts`) | oxlint `no-restricted-imports`; `shadcn/no-restyle` bans `className` restyling in `domains/**` and `routes/**` |
| Split view = Queue + Detail (`SplitView`); no `*Console` / `*Workbench` / `*Tape` exports | `watchdog/no-banned-surface-name` (a `*Panel` screen name is reviewed by hand) |
| One exported component per `.tsx` file (a family of parts is a folder with an `index.ts` barrel, like `shared/ui/skeletons/`); tests, the `/ui` gallery and `primitives/` wrappers are exempt | `watchdog/one-component-per-file` (no baseline) |
| Query cache is the source of truth: `ensureQueryData` loaders and `useQuery` / named invalidation; no loader→`useState` forks, no QueryClient singleton | guidance |
| Effects only subscribe to external systems or do DOM work: no prop-to-state sync, no fetch in an effect (`useQuery` keyed by all its inputs), reset a form by `key` ([`effects.md`](../../docs/reference/web/ui/effects.md)) | oxlint `react-doctor/no-adjust-state-on-prop-change`, `no-mirror-prop-effect`, `no-reset-all-state-on-prop-change`, `no-derived-state-effect`, `no-fetch-in-effect` (it recognizes only a literal `fetch`: reading through `useQuery` instead of fetching in an effect is guidance); the loader/query-to-state half and the `key` reset are guidance |
| Failure fallbacks use `couldnt(verb, noun)` into `errMessage` (system `Failed to ...` and a few verb-only fallbacks are kept on purpose); typing delays go through `useDebouncedValue` with a constant from `shared/lib/debounce.ts`; no `role="button"`; an icon-only `Button` has an accessible name (`aria-label` or sr-only text) | `apps/web/src/lib/__tests__/source-conventions.test.ts` bans `... failed` / `Could not` strings, the `role="button"` literal and stray `*DEBOUNCE*` constants; oxlint `react-doctor/shadcn-icon-button-requires-label` flags an unnamed icon-only `Button`; the rest is guidance ([`rules.md`](../../docs/reference/web/ui/rules.md)) |
| Caps/agents → Proposal → Triage Accept; never land output as `confirmed` Graph | guidance (root Boundaries) |

## Gotchas

- Production serving: `vite build` writes `dist/client` and `dist/server/server.js` (a fetch handler, not a server). `scripts/serve.mjs` (srvx: static files plus that handler; `PORT`, `HOST`) is the production entry, `pnpm --filter @watchdog/web start` runs it after a build. The container image builds with `WD_BUNDLE_SSR=1` (every dependency inlined, `vite.config.ts`) and bundles the server into `dist/serve.mjs` with `build:serve`; a new server-only dependency needs no image change, but a dynamic `require` or `fs` read of a file next to `node_modules` would break the bundle. Check with `docker build --target web .`; image, compose and smoke test: [`self-host`](../../docs/how-to/self-host.md).
- Keep server code off the client import graph: Job Detail reads artifacts through `getArtifactContentFn` in `jobs-artifact.functions.ts` (not `@watchdog/api`/`core` directly); zip/md export routes use `runApp`.
- Client UI must not import the `@watchdog/policy` barrel (pulls Effect into the browser): use the subpaths `@watchdog/policy/patch-needs-confidence` / `@watchdog/policy/confirmed-evidence`. For job/playbook labels use `@watchdog/core/job-display`, not another `@watchdog/core` subpath. Import `JobListRecord` / `JobRecord` from `@/domains/jobs/types`, not `jobs.functions`. Guidance only: no lint rule covers these.
- Process logging goes through `@watchdog/log` and the `src/start.ts` middleware.
- Request bodies are capped at `REQUEST_BODY_MAX_BYTES` (`@watchdog/schemas`, 2 MiB) by the server entry `src/server.ts` (`lib/body-limit.server.ts`): over the limit is a `413` with `data.code: "payload_too_large"` before routing, still carrying the security headers; `scripts/serve.mjs` passes the same number to srvx as `maxRequestBodySize`. Evidence uploads go to S3 with a presigned PUT and keep their own limit (`MAX_UPLOAD_BYTES`); a route that reads a body needs no check of its own (`/api/csp-report` keeps its tighter 8 KiB cap). Operator reference: [`self-host`](../../docs/how-to/self-host.md#request-size-limit).
- Paged web lists (Triage queue, Recent activity, Deleted Cases, row history) are infinite queries with `LoadMore` and `useFetchMoreUntil` ([`data.md`](../../docs/reference/web/data.md#paged-lists)). API lists are paged, so a ServerFn that still feeds a whole-list screen (graph, dossier tabs, kanban, Triage) reads every page with `listAllPages` (`src/lib/list-pages.server.ts`, the largest page each time) and returns the array; a table that can grow without bound reads a page at a time (an infinite query over a paged ServerFn: `deletedCasesQuery` is the model).
- Security headers are one module (`src/lib/security-headers.server.ts`) behind the outermost request middleware in `src/start.ts`. Inline `<script>` / `<style>` must carry `useRouter().options.ssr?.nonce`; no `'unsafe-inline'` for scripts, no runtime-injected `<style>` (Base UI's is off via `CSPProvider disableStyleElements`; its rule is in `styles/wd-overrides.css`). A route browsers on other origins may call uses `src/lib/api-cors.server.ts` (trusted origins only). Operator reference: [`self-host`](../../docs/how-to/self-host.md#security-headers-and-cross-origin-access).
- Brand at the edge (ADR-0003): parse route params with `parseTrimmedCaseId` (Case id; 404 on `null`) or `parseTrimmedUuid` (any other uuid), search params with `optionalCaseIdSchema` / `trimmedCaseIdSchema`, and read cookies and SSE ids through the same parsers; never `as CaseId` (lint `watchdog/no-brand-cast`). Details: [`domains.md`](../../docs/reference/web/domains.md).
- Web tests get `@/auth/server` replaced for free (`src/testing/mock-auth-server.setup.ts`, a setup file of the web-unit and component projects): never copy `vi.mock("@/auth/server", ...)`; a test of the real module calls `vi.unmock`. Toast spies, record builders (`buildEvidenceRecord`, `buildJobListRecord`, `buildProposalRecord`) live beside it in `src/testing/`. Mock policy: [`standards.md`](../../docs/contributing/testing/standards.md#mock-policy).
- Error recovery (#312): the root route and `/_protected` render `RootError` (retry, go to dashboard); pages keep `RouteError`; both call `useRouteErrorRecovery` (a stale-chunk failure reloads once, `shared/lib/chunk-reload.ts`; anything else posts to `/api/client-errors`, never to a tracker). `ClientErrorListeners` in the root document catches unhandled errors and rejections. A component test that renders a boundary must stub `fetch`. Operator guide: [`self-host`](../../docs/how-to/self-host.md#error-reporting).

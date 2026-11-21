# Web guide

> Scope: `apps/web` (TanStack Start). Inherits the root [AGENTS.md](../../AGENTS.md). UI contracts live in [`docs/reference/web/`](../../docs/reference/web/README.md) and win over this file; traps are indexed at [`README.md#traps-index`](../../docs/reference/web/README.md#traps-index).

## Data

- SSR is off (`defaultSsr: false` in `src/start.ts`): the server renders only the document shell, and loaders, `beforeLoad` and components run in the browser, so client code needs no server branch, server snapshot or hydration guard.
- Every domain calls the API through `@/lib/orpc-client` (`orpc`); there are no server functions and no Drizzle here. `/api/rpc` needs the client's `x-csrf-token`, so never call it with a bare `fetch`. What is not a procedure is a route in `routes/api/*` that authenticates itself.
- The Query cache is the source of truth: a server read is a `useQuery` keyed by all its inputs; never copy loader or query data into state, never fetch in an effect. Loaders await identity only and warm lists with `void prefetchQuery`.
- Lists read a page at a time through `listView` + `useList` (or `useListFeed` / `useListFirstPage`): no hand-built infinite query, no whole-list read, no tile count from `array.length` ([`lists.md`](../../docs/reference/web/lists.md)). A picker searches on the server through a `PickerPort`.
- Invalidate through the named contracts in `app/lib/query-invalidation.ts`, never an ad-hoc `invalidateQueries` list.
- Keep server code off the client graph. Browser code imports `@watchdog/domain/policy/patch-needs-confidence`, `@watchdog/domain/policy/confirmed-evidence` and `@watchdog/server/core/job-display`, never those package roots (no lint covers it).
- Parse route, search, stored and SSE ids at the edge with `parseTrimmedCaseId` / `parseTrimmedUuid` and the Case id schemas; never cast a brand.

## Components and effects

- Effects only subscribe to external systems or do DOM work. A form that follows a record resets by remounting under a `key` of the record id and every input that picks its initial values, never `form.reset` in an effect.
- TanStack Form only; field errors through `fieldInvalid` / `fieldErrorList`; one `useForm` per composer.
- `shared/ui` never fetches, mutates or routes. Build new atoms on `/ui` first; extract a named generic at the second call site.
- Routes read the URL through the router (`useSearch`, `useParams`), never `window.location`; a route tab list is one SCREAMING constant the type derives from.
- Inline `<script>` / `<style>` carries the request nonce; no `'unsafe-inline'` scripts and no runtime-injected `<style>`.

## Copy and design

- Copy: `Couldn't` / `Can't` / `Failed to`, never `Unable to` or `Oops`; Title Case labels; `Verb + Noun` primaries. One failure gets one feedback layer; an irreversible action uses type-to-confirm; empty states use `EmptyState` intents ([`ux`](../../docs/explanation/ux.md)).
- Taste: flat surfaces, no nested cards, glow, icon-tile grids or bounce easing; selection is an amber wash; the radius ladder is sm / md / lg ([`DESIGN.md`](../../DESIGN.md)). Edit the CSS in `src/styles/`, then `pnpm generate:design`.
- An icon-only control has an accessible name; a clickable card is a real `<button>`; `Button` with `render={<Link/>}` sets `nativeButton={false}`.
- Never a screen named `*Panel` or a component named `Entity`; chrome is Queue + Detail.
- `PageHeader` is the only inset top chrome; Work URLs carry the Case slug, never a Case id.

## Tests and build

- `@/auth/server` is replaced for every web test by a setup file; toast spies, record builders and the oRPC client double live in `src/testing/` (`@canonical`). Render under a real `QueryClient`, mock no data hook, and import query keys from the domain's `queries.ts`.
- The container image bundles the server (`WD_BUNDLE_SSR=1`): a dynamic `require` or a file read beside `node_modules` breaks it. Check with `docker build --target web .`.

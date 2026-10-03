# UI: page shell

`Page`, `PageHeader`, the trail, and who owns them. Pixel measurements live in the components (`shared/layout/`, `shared/ui/split-view.tsx`), not here.

## Page shell

- `<Page>` has `density` `"split"` or `"default"`. App scroll lives on `<Page density="default">`, not `window`.
- `<PageHeader>` is the sole inset top chrome. It always renders and mounts the route + Active-Case trail (`AppBreadcrumbs`). Optional props: `actions=`, `current=` (last-crumb override), `count=` + `countOn=` (a `TabCount` on the last crumb; hidden at 0 and once the trail has left that crumb, so a pending previous page cannot keep its pill), and `below=` (line tabs). Do not pass identity titles or explainer `description=` copy (404 pages may pass it for the missing slug). Do not add a second AppShell header. `guidance`.
- **Ownership:** the domain entry owns `<Page>` + `PageHeader` for split (`collect.tsx`, `triage.tsx`), table, board, stack (Dossier, Case Overview, Cases list), and the Dashboard (`density="split"` with a vertical resizable overview and Activity). The domain must not wrap a second `<Page>`. Settings is the exception: the route owns `<Page>` + `PageHeader` and the domain owns `SettingsShell`. The loader/pending table per layout kind is in [`domains.md`](../domains.md#page-ownership).
- Below 768px `SplitView` stacks: Queue first; tapping a row shows Detail under a back control (`backLabel`). URL auto-selection does not flip the view.
- `SectionLabel` is normal case (`text-2xs font-medium`); uppercase only for tiny status or priority labels.
- `shared/ui/graph/` hosts the shared graph chrome (`GraphCanvas`, `EntityNode`, `GraphEdgePath`). The case graph page fills the column under the header (`min-h-0 flex-1`); don't cap it at a viewport height.

## Trail

The last crumb is the current page (`aria-current="page"`); ancestors are links. A Case crumb is a folder icon + name (no `Case:` prefix); as the first crumb it links to Overview (`/cases/$activeSlug`). Work surfaces read `{folder} {name} / Collect`; Dossier reads `{folder} {name} / Entities / {name}`, with an `EntityKindGlyph` + `EditableTextCell` last crumb passed through `current=`. No Active Case: omit the Case crumb. Don't lift Collect/Triage `?id=` / `?proposalId=` selections into the PageHeader. The matcher is `shared/layout/page-trail.ts` (pure); the hook is `use-page-trail.ts`.

## Gotchas

- **Active Case is not in the URL.** The cookie persists across refresh and tabs share one Case; deep links do not encode it. The PageHeader Case crumb reads the same cookie via `casesContextQuery`: never invent a second Case cookie reader or put Case in Work URLs. The Overview URL `/cases/{slug}` does follow a rename (`useUpdateCase` replace-navigates); the old slug 404s (no alias table).
- **Not-found still mounts `PageHeader`** (`current="Not found"`).
- **Scroll restoration is off** (`createRouter({ scrollRestoration: false })`, asserted in `apps/web/src/__tests__/router.test.ts`). TanStack's default writes inner scroll positions to `sessionStorage` and replays them via an SSR inline script, then resets to top on render; programmatic scroll-to-top does not re-register the Page node, so stale mid-page entries survive and a refresh flickers middle to top. Do not re-enable without `scrollToTopSelectors` on Page and a plan for the inline script.

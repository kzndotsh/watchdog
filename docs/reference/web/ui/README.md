# UI — delivery and chrome

**What this is:** delivery gates, chrome lexicon, PR checklist.  
**What this is not:** tokens/loading detail — see sibling leaves in this folder.

## Delivery

Greenfield Foundations/atoms on `/ui` **before** inventing chrome inside live product pages. `shared/ui` = presentational only (**no I/O**). Domains wire data via hooks/serverFns. Extract named generics at the **second** call site.

| Gate                      | Command                                      |
| ------------------------- | -------------------------------------------- |
| Typecheck + DS bans       | `pnpm --filter @watchdog/web ds:check`       |
| Hand-owned atom checklist | `scripts/wd-ui-files.mjs`                    |
| After `shadcn add`        | `pnpm --filter @watchdog/web shadcn:nocheck` |

## Chrome lexicon (UI parts)

Name the **layout kind**, then the **parts**. These are component/layout words — not product feature names.

| Kind | Parts | Layout atom |
| --- | --- | --- |
| **split** | **Queue** (list) + **Detail** (selection) | `SplitView`, `density="split"` |
| **stack** | **Section** × N | — |
| **table** | data table | Entities / Identifiers; bulk-add preview |
| **form** | **FormSection** × N | — |
| **card grid** | searchable cards (+ dashed create CTA) | Cases — `ACCENT_CARD_SURFACE` |
| **board** | status columns + cards (kanban) | `/tasks` + Dossier Tasks tab — domain-owned (`TaskBoard`) |
| **mixed (dashboard)** | Stat cards + section panels + resizable Activity (`ScrollArea`) | `/` Dashboard — domain-owned (`MetricsSection`, `dashboard-panels`, `RecentActivity` in vertical `ResizablePanelGroup`) |

| Part | Code |
| --- | --- |
| **Page** | `<Page>`, `PageHeader` (trail / `AppBreadcrumbs`), `PageToolbar` |
| **Queue** | `QueueRow`, `QueueHeader`, `QueueFilterBar`, `{Domain}QueueList` |
| **Detail** | `{Domain}Detail`, `DetailHeader`, `DetailFooter`, `DetailEmpty` |
| **Section** | `DossierSection`, `FormSection`, … |
| **Drawer** / **Dialog** | overlay primitives + domain wrappers |
| **Toolbar** | `PageToolbar`, `{Domain}QueueToolbar` |

**Bar** only in compounds (`QueueFilterBar`, `SectionHeaderBar`).

**Banned as UI surface names:** Console · Workbench · Tape · Panel · Pane · Rail · Strip.  
Vendor exception: `react-resizable-panels` / `data-slot="resizable-panel*"`.

```
SplitView → Queue | Detail
Never: *Console *Workbench *Panel *Pane *Rail *Strip *Tape
```

```
┌─ Page ───────────────────────────────┐
│ PageHeader / PageToolbar             │
├──────────────┬───────────────────────┤
│ Queue        │ Detail                │
│  QueueHeader │  DetailHeader / Collect crumb+tabs │
│  QueueRow…   │  body                 │
│              │  DetailFooter (CTAs)  │
└──────────────┴───────────────────────┘
```

## UI PR checklist

1. [ ] Semantic tokens / existing primitives — refuse list above
2. [ ] Shell not replaced by skeleton; loading matrix followed
3. [ ] Loading / empty / error / success share footprint in the data region
4. [ ] Chrome lexicon above — no banned surface nouns
5. [ ] `shared/ui` remains no-I/O
6. [ ] Opaque ids via `IdChip` / `formatOpaqueId` (no `.slice`)
7. [ ] Right control for the job (ButtonGroup / ToggleGroup / SearchField / badges)
8. [ ] `pnpm --filter @watchdog/web ds:check` passes
9. [ ] New hand-owned atom? Update `wd-ui-files.mjs` + `COMPONENTS.md` (under `shared/ui/`, not `shadcn/` or `__tests__/`)

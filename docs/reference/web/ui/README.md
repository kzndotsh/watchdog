# UI: delivery and chrome

This page covers delivery gates, the chrome lexicon, and the PR checklist. Token and loading details are in the sibling pages.

## Delivery

Build new foundations and atoms on `/ui` before adding chrome to live product pages. `shared/ui` is presentational only (**no I/O**). Domains wire data through hooks and ServerFns. Extract a named generic at the **second** call site.

| Gate                      | Command                                      |
| ------------------------- | -------------------------------------------- |
| Typecheck + DS bans       | `pnpm --filter @watchdog/web ds:check`       |
| Hand-owned atom checklist | `scripts/wd-ui-files.mjs`                    |
| After `shadcn add`        | `pnpm --filter @watchdog/web shadcn:nocheck` |

## Chrome lexicon (UI parts)

Name the **layout kind**, then the **parts**. These are component/layout words: not product feature names.

| Kind | Parts | Layout atom |
| --- | --- | --- |
| **split** | **Queue** (list) + **Detail** (selection) | `SplitView`, `density="split"` |
| **stack** | **Section** × N | : |
| **table** | data table | Entities / Identifiers; bulk-add preview |
| **form** | **FormSection** × N | : |
| **card grid** | searchable cards (+ dashed create CTA) | Cases: `CASE_CARD_SHELL_CLASS` |
| **board** | status columns + cards (kanban) | `/tasks` + Dossier Tasks tab: domain-owned (`TaskBoard`) |
| **mixed (dashboard)** | Borderless metric stats + section panels + resizable Activity (`ScrollArea`) | `/` Dashboard: domain-owned (`MetricsSection`, `dashboard-panels`, `RecentActivity` in vertical `ResizablePanelGroup`) |

| Part | Code |
| --- | --- |
| **Page** | `<Page>`, `PageHeader` (trail / `AppBreadcrumbs`), `PageToolbar` |
| **Queue** | `QueueRow`, `QueueHeader`, `QueueFilterBar`, `{Domain}QueueList` |
| **Detail** | `{Domain}Detail`, `DetailHeader`, `DetailFooter`, `DetailEmpty` |
| **Section** | `DossierSection`, `FormSection`, … |
| **Drawer** / **Dialog** | `shadcn/dialog` (forms) · `AlertDialog` (confirm) · domain wrappers — see [`tokens.md`](tokens.md#overlay-primitives) |
| **Toolbar** | `PageToolbar`, `{Domain}QueueToolbar` |

**Bar** only in compounds (`QueueFilterBar`, `SectionHeaderBar`).

**Naming rule:** name a surface by its layout kind and parts above. Don't invent a new layout word for a screen.

| Word | Status | Why |
| --- | --- | --- |
| Console · Workbench · Tape | **Banned** | v2 metaphor names (`JobsConsole`, `ReviewTape`, `CopilotWorkbench`) for what were Queue + Detail. No standard web-UI meaning. |
| Panel | Standard meaning only | A tab's content region (ARIA `tabpanel`: `SettingsPanel`, `EvidenceContentPanel`) or a resizable region (`ResizablePanel`, dashboard panels). Never a whole screen (`JobsPanel`). |
| Pane · Rail · Strip | Avoid | Use the lexicon part instead (Detail, Section, Toolbar, `…Line`). Vendor `SidebarRail` is fine. |

```
SplitView → Queue | Detail
Never: *Console *Workbench *Tape  ·  never a screen named *Panel
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

1. [ ] Semantic tokens / existing primitives: refuse list above
2. [ ] Shell not replaced by skeleton; loading matrix followed
3. [ ] Loading / empty / error / success share footprint in the data region
4. [ ] Chrome lexicon above: no banned surface nouns (Console / Workbench / Tape); Panel only in its standard meaning
5. [ ] `shared/ui` remains no-I/O
6. [ ] Opaque ids via `IdChip` / `formatOpaqueId` (no `.slice`)
7. [ ] Right control for the job (ButtonGroup / ToggleGroup / SearchField / badges)
8. [ ] `pnpm --filter @watchdog/web ds:check` passes
9. [ ] New hand-owned atom? Update `wd-ui-files.mjs` + `COMPONENTS.md` (under `shared/ui/`, not `shadcn/` or `__tests__/`)

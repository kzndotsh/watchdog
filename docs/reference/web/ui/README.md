# UI: delivery and chrome

The chrome lexicon (the words used to name screens and their parts) and the delivery rules for `shared/ui`. Design direction is in [`/DESIGN.md`](../../../../DESIGN.md); what enforces each rule is in [`rules.md`](rules.md); investigator-facing conventions are in [`ux.md`](../../../explanation/ux.md).

## Delivery

Build new foundations and atoms on `/ui` before adding chrome to live pages. `shared/ui` is presentational (no I/O); domains wire data through hooks and ServerFns. Extract a named generic at the second call site. Both are `guidance`.

| Gate | Command |
| --- | --- |
| DS bans | `pnpm check` (oxlint `watchdog/no-decorative-class`, `watchdog/no-banned-surface-name`, `watchdog/no-opaque-id-slice`) |
| Typecheck | `pnpm --filter @watchdog/web typecheck` |
| Vendored primitives lock | `pnpm check:vendor` (change with `pnpm ui:add` / `pnpm ui:sync`) |

## Chrome lexicon (UI parts)

Name the **layout kind**, then the **parts**. These are component and layout words, not product feature names.

| Kind | Parts | Layout atom |
| --- | --- | --- |
| **split** | **Queue** (list) + **Detail** (selection) | `SplitView`, `density="split"` |
| **stack** | **Section** x N | Dossier, Case Overview |
| **table** | data table | Entities, Identifiers; bulk-add preview |
| **form** | **FormSection** x N | Settings |
| **card grid** | searchable cards (+ dashed create CTA) | Cases: `CASE_CARD_SHELL_CLASS` |
| **board** | status columns + cards (kanban) | `/tasks` + Dossier Tasks tab: `TaskBoard` |
| **mixed (dashboard)** | metric stats + section panels + resizable Activity | `/`: `MetricsSection`, `dashboard-panels`, `RecentActivity` |

| Part | Code |
| --- | --- |
| **Page** | `<Page>`, `PageHeader` (trail / `AppBreadcrumbs`), `PageToolbar` |
| **Queue** | `QueueRow`, `QueueHeader`, `QueueFilterBar`, `{Domain}QueueList` |
| **Detail** | `{Domain}Detail`, `DetailContextHeader`, `DetailFooter`, `DetailEmpty` |
| **Section** | `DossierSection`, `FormSection`, `SectionHeaderBar` |
| **Dialog** | `Dialog` (forms) and `AlertDialog` (confirm); choice rule in [`DESIGN.md`](../../../../DESIGN.md#components) |
| **Toolbar** | `PageToolbar`, `{Domain}QueueToolbar` |

**Bar** appears only in compounds (`QueueFilterBar`, `SectionHeaderBar`).

**Naming rule:** name a surface by its layout kind and parts above; don't invent a new layout word for a screen.

| Word | Status | Why |
| --- | --- | --- |
| Console, Workbench, Tape | **Banned** | v2 metaphor names for what are Queue + Detail. Enforced for export names by `watchdog/no-banned-surface-name`. |
| Panel | Standard meaning only | A tab's content region (ARIA `tabpanel`: `SettingsPanel`) or a resizable region (`ResizablePanel`). Never a whole screen. Review-only: no lint rule checks it. |
| Pane, Rail, Strip | Avoid | Use the lexicon part (Detail, Section, Toolbar). Vendor `SidebarRail` is fine. |

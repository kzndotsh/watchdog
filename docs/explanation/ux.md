# UX: investigator conventions

**What this is:** the UX conventions that are not obvious from the code: what an empty or failed state means, which feedback layer carries a failure, how destructive actions are confirmed, and copy rules. Routes, flows, and per-screen behavior live in the code and its tests, not here. Product intent and doctrine: [`product.md`](product.md). Visual rules and tokens: [`/DESIGN.md`](../../DESIGN.md).

Operate mode: task clarity over surprise. Surfaces earn their chrome; don't invent a second app inside a page. None of the conventions below is mechanically enforced; they are `guidance` checked in review (the empty-state intents are typed by `EmptyStateIntent`).

## Triage Accept (UX-only rules)

Canonical gates: [`custody`](../reference/contracts/custody.md) and [`agent-ingress`](../reference/contracts/agent-ingress.md). These are the Accept rules the contracts do not restate:

- Cap and agent patch `data` must not include confidence: the human picks it on Accept.
- Claim `class` is kept as proposed (default `observation`); edit it later in the Dossier. No bulk class editor on Accept.
- Reject drops the patch, keeps already-captured Evidence, takes an optional reason, and leaves the row in history (Rejected filter).
- Identifier collision (a proposed `type+value` already on another Entity in the Case): Triage shows a warn Alert and a per-op chip. Warn, don't block. Caps stay Case-blind; this check is core/Triage.
- Invalid Identifier values (`validateIdentifierWrite`): Triage chips the op and disables Accept, and core hard-fails the transaction. Reject or rewrite the Proposal; there is no partial Accept.

## Empty, error, success

| Intent | When | Component |
| --- | --- | --- |
| blank-slate | Never had items | `EmptyState` intent `blank-slate` |
| no-results | Filters hide everything | `EmptyState` intent `no-results` (+ clear) |
| cleared | The queue of remaining work is empty | `EmptyState` intent `cleared` |
| select-none | Nothing selected in Detail | `DetailEmpty` |
| load failure | Region fetch failed | `FetchErrorAlert` |
| permission | Can't view route or tile | Inline Alert, not a joke empty |

The shell (Page, header, toolbar) stays mounted; only the data region swaps state. Never use raw shadcn `Empty` in a domain. Empty CTAs are a real `Button` or `Link`, at most one primary; never `Get Started` or `OK`. Persistent warnings (dual-control, AI-debt) stay an Alert, not an empty state.

## Feedback layers

| Failure | Surface |
| --- | --- |
| Field validation | Input or Field helper, never a toast |
| Transient mutation fail / OK | Toast (`shared/ui/toast`) |
| Region or route load fail | `FetchErrorAlert` in the data region |
| Blocking policy (e.g. dual-control) | Inline Alert, not a toast |
| Destructive confirm fail | Inline error inside the dialog; stay open |

One failure gets one layer, not a toast plus an inline error. Error copy: user-state `Couldn't` / `Can't`, system `Failed to`; never `Unable to` or `Oops`. The title names the resource (`Couldn't load jobs`).

## Destructive actions

| Stakes | Confirm |
| --- | --- |
| Irreversible delete, revoke, wipe | `DestructiveConfirmDialog` (type-to-confirm) |
| Medium (e.g. Hide an Evidence row) | Plain `AlertDialog` |
| Routine cancel or discard | No type-gate |

Dialog titles are Title Case statements (`Delete case`), not questions. The primary is `Verb + Noun` matching the title. Destructive menu items go last, separated. Never bury delete behind a SplitButton chevron.

## Copy and controls

- Labels: Title Case nouns. Menu and dialog primaries: `Verb + Noun`.
- Placeholders are examples, not instructions (`example.com`, not `Enter your domain`).
- Field errors name the field and end with a period (no "please").
- Select for up to ~10 fixed options; Combobox when filtering helps. ToggleGroup for 2-3 view modes (not a boolean `Switch`). Tabs for sibling views, URL-synced where possible. A disabled control gets a Tooltip saying why.

## Case shell

Active Case is cookie-scoped, never in Work URLs. Opening `/cases/$caseSlug` heals the Active Case to that slug, so switching Case while on Overview must navigate to the new slug or the stale heal snaps the cookie back. The Case switcher is a DropdownMenu (not Select) so option clicks commit reliably beside drag-and-drop surfaces. Do not reintroduce Overview line tabs that clone `/entities`, `/identifiers`, `/graph`, or `/tasks`.

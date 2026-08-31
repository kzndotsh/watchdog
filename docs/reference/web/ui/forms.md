# UI — form library

**What this is:** TanStack Form vs local-state boundaries.

## Form library

**Stack:** `@tanstack/react-form` only. Do not add `react-hook-form`.

| Use TanStack Form | Leave as local state |
| --- | --- |
| Composer / dialog with discrete Save/Submit | Single-value commit-on-blur/Enter (`EditableTextCell` / `EditableSelectCell` — incl. dossier last-crumb rename) |
| 2+ fields, or a cross-field rule (e.g. confirmed↔evidence, `related_to`↔notes) | Blur-autosave Markdown prose (`SummarySection` / `NotesSection` via `RichTextEditor`); Case rename/description/egress (`CaseSettingsForm` — field drafts + mutation) |
|  | `SearchField` / queue filter facets (live filter, no submit) |
|  | `DestructiveConfirmDialog` type-to-confirm gate |

**Conventions**

- Wire client validators to the same domain Zod schemas used on ServerFns when shapes align (Zod v4 Standard Schema — no `@tanstack/zod-form-adapter`).
- Server/mutation failures: `catch` → `FormInlineError` / toast via plain `useState` — not TanStack Form’s error map / `isSubmitSuccessful`.
- One self-contained `useForm` per composer; do not split one form across children via context. Create vs edit = two `useForm` instances (share config with `formOptions` if needed).
- Shared claim create/edit: `dossier/lib/claim-form.ts` (`claimFormOptions`, `claimEvidenceIdsValidator`) → one `ClaimComposer` in `claims-section.tsx`.
- Triage Accept/Reject: `useTriageDetailForms` (`triage/hooks/use-triage-detail-forms.ts`) — two `useForm` instances; do not split across children. Accept composer values: `AcceptFormValues` in `triage/types.ts` (imported by hooks + Detail — not defined under `components/`).
- Confirmed↔evidence gate + copy: `dossier/lib/confirmed-evidence.ts` (also Triage + connection dialog).
- Every field: `onBlur={field.handleBlur}`; validators return `string | undefined`; gate onChange/onBlur errors with `isTouched`; use `form.Subscribe` with narrow selectors; `evidenceIds` is a plain `string[]` field (not `mode="array"`).
- Split-view queue URL SoT: `resolveQueueSelection` (`shared/lib/queue-selection.ts`) + render-time `<Navigate replace>` when URL ≠ resolved selection (Collect / Triage) — not a sync `useEffect` that calls the parent navigate callback. Collect may pass `holdMissingUrlId` so a just-started (or filter-hidden) job id is not Navigate-clobbered.

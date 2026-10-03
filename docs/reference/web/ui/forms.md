# UI: forms

The boundary between TanStack Form and local state. The only mechanical part is that `react-hook-form` is absent from `package.json`, so importing it fails `typecheck`; the rest is `guidance`.

Use `@tanstack/react-form` only.

| Use TanStack Form | Leave as local state |
| --- | --- |
| A composer or dialog with a discrete Save/Submit | Single-value commit-on-blur/Enter (`EditableTextCell`, `EditableSelectCell`, including the dossier last-crumb rename) |
| 2+ fields, or a cross-field rule (confirmed requires evidence, `related_to` requires notes) | Blur-autosave Markdown prose (`SummarySection` / `NotesSection` via `RichTextEditor`); Case rename, description, and egress (`CaseSettingsForm`) |
|  | `SearchField` and queue filter facets (live filter, no submit) |
|  | The `DestructiveConfirmDialog` type-to-confirm gate |

## Conventions

- Wire client validators to the same domain Zod schemas the ServerFns use when shapes align (Zod v4 Standard Schema; no `@tanstack/zod-form-adapter`).
- Render field validation through `@/shared/lib/field-errors`: `<Field data-invalid={fieldInvalid(field.state.meta)}>`, `aria-invalid` on the control, then `<FieldError errors={fieldErrorList(field.state.meta)} />`. Compact composers without a `Field` wrapper still set `aria-invalid` and render `FieldError` beneath the control.
- Server or mutation failures use `catch` and plain `useState` to `FieldError` or a toast, not TanStack Form's error map or `isSubmitSuccessful`.
- One self-contained `useForm` per composer; don't split one form across children via context. Create and edit are two `useForm` instances (share config with `formOptions`).
- Shared claim create/edit: `dossier/lib/claim-form.ts` (`claimFormOptions`, `claimEvidenceIdsValidator`). Triage Accept/Reject: `useTriageDetailForms` (two `useForm` instances); the composer values type `AcceptFormValues` lives in `triage/types.ts`, not under `components/`. The confirmed-needs-evidence gate and copy: `shared/lib/confirmed-evidence.ts`.
- Every field wires `onBlur={field.handleBlur}`; validators return `string | undefined`; gate onChange/onBlur errors with `isTouched`; use `form.Subscribe` with narrow selectors; `evidenceIds` is a plain `string[]` field, not `mode="array"`.

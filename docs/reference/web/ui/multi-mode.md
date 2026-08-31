# UI: multi-mode Detail / composers

This page defines multi-mode patterns for Detail and composers.

## Multi-mode UI (Detail / composers)

Use **mode composition** instead of nested ternaries when a surface has mutually exclusive layouts (pending vs decided, accept vs reject, add vs edit). Chip-level `{cond ? <X/> : null}` is fine.

| Pattern | Use when | Example |
| --- | --- | --- |
| Early `return` / mode child components | Whole branch differs | `PendingDecideBand` / `DecidedDecideBand` |
| Pure `build*View()` in `lib/` | Several flags drive chrome | `decide-header-view.ts`, `job-detail-view.ts`, Cap/playbook seed views |
| One discriminant for exclusive actions | Parallel busy flags drift | Intake `pending: { kind; evidenceId }`: not four ID booleans |
| Exhaustive `switch` + `never` | Discriminated unions | `ArtifactPreviewBody`, vocab, status edges |
| `ActiveTabBody` + `TabsContent` | Stack / Detail tabs | Case · Dossier · Collect (Evidence detail): **conditional unmount** (not React `<Activity>`) for heavy canvases |

Reference: Triage decide chrome (`triage-decide-header.tsx` + `triage-decide-footer.tsx` + `lib/decide-header-view.ts`). Official React guidance: [Conditional Rendering](https://react.dev/learn/conditional-rendering), [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure).

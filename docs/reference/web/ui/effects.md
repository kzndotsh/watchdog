# UI: effects

When a component may use `useEffect`. An effect is an escape hatch to something outside React; it is never the way to move data between props, state, and the Query cache. Prop-to-state sync is mechanically enforced (below); the rest is `guidance`.

## Policy

| Do not | Instead |
| --- | --- |
| Copy a prop, loader result, or query result into `useState` from an effect (the first render after the change shows the old value) | Derive it during render, or read the query result directly. When state must be re-seeded from a prop that changes from outside, adjust it during render against the previous prop (`if (seeded !== prop) { setSeeded(prop); setX(...) }`), as `TriageWithCase` does for the URL status |
| Correct state that can be computed (a selected id that no longer exists, a clamped value) by calling a setter in an effect | Compute the effective value during render from the raw state and the data |
| Fetch in an effect (`fetch`, `authClient.*`, a ServerFn), or keep the answer in state | `useQuery` with a key that holds every input. A debounced input goes into the key through a debounced value, never into a timer that calls the server (`useSlugAvailability`) |
| Reset a form, or other state, when a record changes (`form.reset(...)`, `setX(initial)` in an effect) | Reset by remounting: put the form in its own component and give it `key={record.id}` (plus every input that picks the initial values, such as mode or default status). The component calls `useForm({ defaultValues })` once and never resets. A dialog keeps the key inside its content, so the form also mounts fresh on each open |
| List an unstable object or an inline callback in an effect's deps (the effect re-runs every render) | Depend on the primitives the effect reads, or a callback made stable in its owner (`useCallback`); if the effect only reacts to a user action, move the work into the handler |

An effect is for subscribing to an external system and for DOM work: an `EventSource` or other stream, a window or `matchMedia` listener, a timer or interval, a `ResizeObserver`, focus and scroll, a ref that mirrors the latest props for a listener. It cleans up what it starts.

Not an exception: a one-off "run once on mount" that moves data or navigates. Use a loader, a query, or a `<Navigate>` sibling ([`loading.md`](loading.md#gotchas)).

## Why a key, not a reset

`form.reset(values)` in an effect runs after the first render with the new record, so the form paints the previous record's values for one frame and a decision made in that frame uses stale input. Remounting under a new `key` renders the new values on the first render, drops every other piece of state the form held (touched, errors, a half-typed field) with the old record, and needs no deps list to get wrong. The `useEffect([..., onSubmit])` reset the task dialog used to have wiped what the user typed whenever the parent passed a new inline `onSubmit`.

## Enforced by

| Rule | Enforced by |
| --- | --- |
| No effect that adjusts state after a prop changes, mirrors a prop into state, or resets all state on a prop change | `oxlint` `react-doctor/no-adjust-state-on-prop-change`, `react-doctor/no-mirror-prop-effect`, `react-doctor/no-reset-all-state-on-prop-change` (no baseline) |
| No state derived in an effect from other state or props | `oxlint` `react-doctor/no-derived-state-effect`, `react-doctor/no-derived-state` |
| No `fetch` in an effect; an effect has a cleanup; the callback is not `async` | `oxlint` `react-doctor/no-fetch-in-effect` (recognises `fetch`, not a client object such as `authClient`), `react-doctor/effect-needs-cleanup`, `react-doctor/no-async-effect-callback` |
| Reset by `key`, not `form.reset` in an effect; a query-backed read instead of a client call in an effect; deps free of unstable objects | `guidance` |

Where a rule has to be silenced, use `oxlint-disable-next-line <rule> -- <reason>` with the reason the effect really talks to an outside system.

## Open debt

Effects that still break the table and are not fixed yet: the credential slot that vanished (`settings-credentials-form.tsx`) and the Job run forms that clamp a selected id (`job-cap-run-form.tsx`, `job-playbook-run-form.tsx`) correct state in an effect; the graph canvas (`graph-canvas.tsx`) clears its drag overrides in a layout effect when the layout key changes; `code-block.tsx` highlights in an effect and keeps the tokens in state.

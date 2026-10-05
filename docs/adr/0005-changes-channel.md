# ADR-0005: The live-update concept is "changes", not "events"

**Status:** accepted (2026-10-05) · closes [#51](https://github.com/kzndotsh/watchdog/issues/51) **What this is:** the name of the Postgres-NOTIFY-to-SSE live-update concept, the identifiers it renames, and the rollout notes. **What this is not:** the rename itself (a ticket) or a change to the timeline Event noun.

## Context

"Events" currently names three different things:

1. **Event**, a product noun: a dated fact on an Entity's timeline (the `events` table, `eventsRepo`, the events API procedures, `wd events`, the dossier Events section). Defined in `GLOSSARY.md`.
2. **Activity events** (`activity_events`): the recent-activity feed.
3. **The live-update channel**: a Postgres `NOTIFY` on the channel `watchdog_events`, relayed to browsers over the SSE route `/api/events` and consumed by the worker's export sync. Nothing in it is a timeline Event; it announces that something in a Case changed so views can refresh.

The third meaning collides with the first two in code and in conversation. Measured on `main`: `WATCHDOG_CHANNEL` (7 mentions), `notifyEvent` (36), `listenForEvents` (49), `listenForEventsStream` (23), `WatchdogEvent` (55), `isWatchdogEvent` (17), `useLiveEvents` (69), `normalizeLiveEventsCaseId`, `liveEventsSubscriptionKey`, the worker's `export-events`, the `@watchdog/core/events` subpath, the `watchdog-events` module in `@watchdog/schemas` and the route `/api/events`.

## Decision

The live-update concept is a **Change**. Rename it everywhere it means the live-update channel:

| Today | After |
| --- | --- |
| channel string `watchdog_events` | `watchdog_changes` |
| `WATCHDOG_CHANNEL` | `CHANGES_CHANNEL` |
| `notifyEvent` and the `notify*ChangedEffect` helpers' module | `notifyChange` / `@watchdog/core/changes` |
| `listenForEvents`, `listenForEventsStream` | `listenForChanges`, `listenForChangesStream` |
| `WatchdogEvent`, `isWatchdogEvent` | `WatchdogChange`, `isWatchdogChange` |
| `useLiveEvents`, `normalizeLiveEventsCaseId`, `liveEventsSubscriptionKey` | `useLiveChanges`, `normalizeLiveChangesCaseId`, `liveChangesSubscriptionKey` |
| SSE route `/api/events` | `/api/changes` |
| worker `export-events.ts` | `export-changes.ts` |
| schemas `watchdog-events` module | `watchdog-changes` |

**Unchanged:** the timeline Event noun and everything built on it (`events` table, `eventsRepo`, events API procedures and schemas, `wd events`, the dossier Events section) and `activity_events`.

`GLOSSARY.md` gets a **Change** entry: a notification, pushed through Postgres NOTIFY and SSE, that something in a Case changed, so views refresh and the export sync reacts. It is not an Event (timeline noun) and not Activity.

## Consequences

- A mechanical rename across db, core, schemas, web and worker (about 16 files for the web hook alone, 12 for the listener); generated route files change with the route.
- **Rollout:** the channel string changes on both ends, and web and worker restart at different times, so live updates are lost between a producer on the new name and a listener on the old one. The deployment is a single self-hosted instance: deploy web and worker together. A browser tab loaded before the deploy keeps requesting `/api/events` until reloaded; the client reconnects and the route 404s, so a reload is needed. No alias is kept because the route is same-origin and served by the same deploy as the client.
- The timeline Event noun stays unambiguous in the glossary and in code.

## Considered

- **Rename the timeline Event instead.** It is a real product noun with a table, an API and a CLI command, so a rename costs more and is user-visible. Rejected.
- **`notifications` or `live-updates`.** `notifications` collides with a likely future user-facing notifications feature, and `live-updates` is long for identifiers (`listenForLiveUpdates`). Rejected for `changes`.
- **Leave it and document the three meanings.** Cheap, but the collision keeps costing in code review and in agent prompts.

## Reopen when

- a user-facing "changes" feature (a change log, for example) makes the name ambiguous again.

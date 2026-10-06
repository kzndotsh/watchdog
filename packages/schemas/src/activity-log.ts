import { z } from "zod";

import { uuidSchema } from "./primitives";
import type { WatchdogEvent } from "./watchdog-events";

/**
 * The activity log (ADR-0005): one append-only entry per domain change. The
 * wire schema here is the single Zod shape for the SSE `activity` event, the
 * replay response and the tailer; the legacy `WatchdogEvent` is derived from it
 * by `legacyEventForActivityEntry` until the contract phase deletes it.
 */

export const ACTIVITY_ENTRY_KINDS = [
  "task",
  "job",
  "proposal",
  "evidence",
  "entity",
  "edge",
  "claim",
  "identifier",
  "event",
  "question",
  "case",
] as const;
export type ActivityEntryKind = (typeof ACTIVITY_ENTRY_KINDS)[number];
export const activityEntryKindSchema = z.enum(ACTIVITY_ENTRY_KINDS);

/**
 * The closed verb list per kind. A slice that moves a domain onto the log adds
 * its verbs here in the same change; `appendActivityEffect` rejects any pair
 * not listed.
 */
export const ACTIVITY_ENTRY_ACTIONS = {
  task: ["created", "status_changed", "updated", "reordered", "deleted"],
  job: ["queued", "running", "succeeded", "failed", "cancelled"],
  proposal: ["created", "accepted", "rejected"],
  evidence: ["captured", "hidden", "restored", "attached", "processed"],
  entity: ["created", "updated", "deleted"],
  edge: ["created", "updated", "deleted"],
  claim: ["created", "updated", "retracted"],
  identifier: ["created", "updated", "deleted"],
  event: ["created", "updated", "deleted"],
  question: ["created", "updated", "resolved", "deleted"],
  case: ["updated"],
} as const satisfies Record<ActivityEntryKind, readonly string[]>;

export function isActivityActionForKind(
  kind: ActivityEntryKind,
  action: string
): boolean {
  return (ACTIVITY_ENTRY_ACTIONS[kind] as readonly string[]).includes(action);
}

/** Longest `label` the log stores (the `activity_label_len` check). */
export const ACTIVITY_LABEL_MAX = 200;

export const activityEntrySchema = z.object({
  /** Opaque `xid:id` resume token; the SSE `id:` field. */
  cursor: z.string(),
  id: z.number().int().positive(),
  caseId: uuidSchema,
  kind: activityEntryKindSchema,
  action: z.string().min(1),
  subjectId: uuidSchema.nullable(),
  groupId: uuidSchema.nullable(),
  label: z.string().max(ACTIVITY_LABEL_MAX).nullable(),
  actorId: z.string().nullable(),
  actorLabel: z.string().nullable(),
  fromValue: z.string().nullable(),
  toValue: z.string().nullable(),
  at: z.string(),
});
export type ActivityEntry = z.output<typeof activityEntrySchema>;

/** Position in the log: the transaction id, then the row id inside it. */
export interface ActivityCursor {
  /** `xid8` as decimal text (it exceeds 2^53). */
  xid: string;
  id: number;
}

const XID_MAX = 2n ** 64n - 1n;
const CURSOR_PATTERN = /^(\d{1,20}):(\d{1,16})$/;

export function formatActivityCursor(cursor: ActivityCursor): string {
  return `${cursor.xid}:${cursor.id}`;
}

/** Parse an opaque cursor (`Last-Event-ID`, `?after=`); `null` when malformed. */
export function parseActivityCursor(raw: string): ActivityCursor | null {
  const match = CURSOR_PATTERN.exec(raw.trim());
  if (match === null) return null;
  const [, xid, idText] = match;
  if (xid === undefined || idText === undefined) return null;
  const id = Number(idText);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  if (BigInt(xid) > XID_MAX) return null;
  return { xid: BigInt(xid).toString(), id };
}

/** Total order of the log: xid (numeric), then id. */
export function compareActivityCursor(
  a: ActivityCursor,
  b: ActivityCursor
): number {
  const ax = BigInt(a.xid);
  const bx = BigInt(b.xid);
  if (ax !== bx) return ax < bx ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * The adapter for consumers that still speak `WatchdogEvent` (old web hook,
 * old worker). Returns `null` for kinds that are not on the log yet: their
 * `notify*Effect` still fires on the old channel.
 */
export function legacyEventForActivityEntry(
  entry: ActivityEntry
): WatchdogEvent | null {
  if (entry.kind === "task") {
    return { type: "task_changed", caseId: entry.caseId };
  }
  if (entry.kind === "job") {
    if (entry.subjectId === null) return null;
    return {
      type: "job_update",
      caseId: entry.caseId,
      jobId: entry.subjectId,
      status: entry.action,
    };
  }
  return null;
}

export interface ActivityGate {
  /** A live entry from the tailer: held back until the replay is in, then passed on. */
  readonly live: (entry: ActivityEntry) => void;
  /** The replay is done: send `replayed` in order, then the held live entries, then go live. */
  readonly open: (replayed: readonly ActivityEntry[]) => void;
}

/**
 * Per-connection ordering and duplicate guard for an SSE stream (ADR-0005
 * decision 4: delivery is at-least-once and a consumer drops cursors at or
 * below its last; this is that rule, so a connection sees each entry once).
 * `after` is the reconnecting client's last cursor, or `null` for a fresh
 * connect (nothing to replay: live entries pass straight through). Live
 * entries that arrive while the replay is being read are held and merged.
 */
export function createActivityGate(
  after: ActivityCursor | null,
  deliver: (entry: ActivityEntry) => void
): ActivityGate {
  let last = after;
  let replaying = after !== null;
  const held: ActivityEntry[] = [];

  function pass(entry: ActivityEntry): void {
    const cursor = parseActivityCursor(entry.cursor);
    if (cursor === null) return;
    if (last !== null && compareActivityCursor(cursor, last) <= 0) return;
    last = cursor;
    deliver(entry);
  }

  return {
    live(entry) {
      if (replaying) {
        held.push(entry);
        return;
      }
      pass(entry);
    },
    open(replayed) {
      for (const entry of replayed) pass(entry);
      replaying = false;
      for (const entry of held.splice(0)) pass(entry);
    },
  };
}

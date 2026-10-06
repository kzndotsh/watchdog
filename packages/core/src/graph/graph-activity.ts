import { Effect } from "effect";

import type { DbExec } from "@watchdog/db";
import type {
  ACTIVITY_ENTRY_ACTIONS,
  ActivityEntryKind,
} from "@watchdog/schemas/feed";
import type { CaseId } from "@watchdog/schemas/shared";

import { appendActivityEffect } from "../activity/append";
import type { DomainTag } from "../infra/tagged-errors";

/** The activity kinds a Graph or Case mutation appends (ADR-0005 S4). */
export type GraphActivityKind = Extract<
  ActivityEntryKind,
  "entity" | "edge" | "claim" | "identifier" | "event" | "question" | "case"
>;

export interface GraphActivityInput<K extends GraphActivityKind> {
  caseId: CaseId;
  kind: K;
  /** A verb from `ACTIVITY_ENTRY_ACTIONS[kind]`. */
  action: (typeof ACTIVITY_ENTRY_ACTIONS)[K][number];
  /** The Entity, Edge, Claim, Identifier, Event, Question or Case the write touched. */
  subjectId: string;
  /** Display snapshot (name, predicate, text), cut to 200 characters. Never Evidence bodies. */
  label?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
}

/**
 * Append one Graph or Case entry (ADR-0005 S4) in the caller's transaction.
 * Every Graph mutation calls this inside the `transact` body that writes, so a
 * rolled-back write leaves no entry and the trigger's NOTIFY goes with it. A
 * mutation that does not call it is caught by `graph-activity-gate.test.ts`.
 */
export function appendGraphActivityEffect<K extends GraphActivityKind>(
  tx: DbExec,
  input: GraphActivityInput<K>
): Effect.Effect<void, DomainTag> {
  return appendActivityEffect(tx, input).pipe(Effect.asVoid);
}

import { Effect } from "effect";

import {
  setGraphHistoryContext,
  type DbExec,
  type GraphHistoryContext,
} from "@watchdog/db";
import type {
  ACTIVITY_ENTRY_ACTIONS,
  ActivityEntryKind,
} from "@watchdog/schemas/feed";
import type {
  CaseId,
  GraphActor,
  GraphHistoryChannel,
} from "@watchdog/schemas/shared";

import { appendActivityEffect } from "../activity/append";
import { optionalActorId } from "../actors/require-actor-id";
import { tryDb } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";

/** The activity kinds a Graph or Case mutation appends (ADR-0005 S4). */
export type GraphActivityKind = Extract<
  ActivityEntryKind,
  "entity" | "edge" | "claim" | "identifier" | "event" | "question" | "case"
>;

export type GraphActivityInput<K extends GraphActivityKind> = {
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
  /** The API key that made the change. */
  actorKeyId?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
};

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

/** The actor fields of an entry, from an input that may carry a {@link GraphActor}. */
export function graphActorFields(actor: GraphActor | undefined): {
  actorId: string | undefined;
  actorLabel: string | undefined;
  actorKeyId: string | undefined;
} {
  return {
    actorId: optionalActorId(actor?.actorId),
    actorLabel: actor?.actorLabel,
    actorKeyId: actor?.actorKeyId,
  };
}

/** The channel of a Dossier write: the caller's, or the `system` when there is none. */
export function dossierChannel(
  actor: GraphActor | undefined
): GraphHistoryChannel {
  return optionalActorId(actor?.actorId) === undefined ? "system" : "dossier";
}

/**
 * The history context of a Dossier write (or a Task edit): the caller, through
 * the `dossier` channel; a write with no caller is the `system`.
 */
export function dossierHistory(
  actor: GraphActor | undefined
): GraphHistoryContext {
  return { ...graphActorFields(actor), channel: dossierChannel(actor) };
}

/**
 * First statement of every Graph write transaction (issue #303): tells the
 * database triggers who is writing and through which door, so each changed row
 * (including rows a cascade removes or unlinks) lands in `graph_history` with
 * its author. The settings end with the transaction, so call it on that
 * transaction's `tx`, never on the pool.
 */
export function setHistoryContextEffect(
  tx: DbExec,
  context: GraphHistoryContext
): Effect.Effect<void, DomainTag> {
  return tryDb(() => setGraphHistoryContext(tx, context));
}

import { Effect } from "effect";

import {
  setGraphHistoryContext,
  type DbExec,
  type GraphHistoryContext,
  type NewChangeset,
} from "@watchdog/db";
import type {
  ACTIVITY_ENTRY_ACTIONS,
  ActivityEntryKind,
} from "@watchdog/domain/schemas/feed";
import type {
  CaseId,
  GraphActor,
  GraphHistoryChannel,
} from "@watchdog/domain/schemas/shared";

import { optionalActorId } from "../actors/require-actor-id";
import type { DomainTag } from "../errors/tagged-errors";
import { requireWritten, tryDb } from "../infra/postgres-effect";
import { appendActivityEffect } from "./append";

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

/** The history context of a Graph write transaction in core: always with its changeset (#724). */
export type GraphWriteContext = GraphHistoryContext & {
  changeset: NewChangeset;
};

/**
 * The history context of a Dossier write (or a Task edit) in `caseId`: the
 * caller, through the `dossier` channel; a write with no caller is the `system`.
 */
export function dossierHistory(
  caseId: CaseId,
  actor: GraphActor | undefined
): GraphWriteContext {
  return {
    ...graphActorFields(actor),
    channel: dossierChannel(actor),
    changeset: { caseId },
  };
}

/**
 * First statement of every Graph write transaction (issues #303, #724): records
 * the transaction's changeset (Case, channel, actor, and what the channel adds:
 * an Accept's Proposal, an agent write's patch and idempotency key) and tells
 * the database triggers who is writing, so each changed row (including rows a
 * cascade removes or unlinks) lands in `graph_history` with its author and
 * changeset. Returns the changeset id. The settings end with the transaction,
 * so call it on that transaction's `tx`, never on the pool.
 *
 * @canonical `setHistoryContextEffect`: Who writes the Graph and the transaction's changeset (#724), for `graph_history` and `created_by` / `updated_by` (first statement of every Graph write transaction; the database triggers do the rest)
 */
export function setHistoryContextEffect(
  tx: DbExec,
  context: GraphWriteContext
): Effect.Effect<string, DomainTag> {
  return tryDb(() => setGraphHistoryContext(tx, context)).pipe(
    requireWritten("record changeset")
  );
}

import { Effect } from "effect";

import type { DbTx } from "@watchdog/db";
import {
  requireEnum as requireEnumPolicy,
  requireEntitySlug as requireEntitySlugPolicy,
  requireString as requireStringPolicy,
  requireUuid as requireUuidPolicy,
} from "@watchdog/policy";
import type {
  CaseId,
  GraphHistoryChannel,
  JsonValue,
} from "@watchdog/schemas/shared";

import { errorMessage } from "../../infra/error-utils";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import {
  appendGraphActivityEffect,
  type GraphActivityInput,
  type GraphRowActivityKind,
} from "../graph-activity";
import type { GraphHistoryChange } from "../graph-history";

export function requireDomainStringEffect(
  data: Record<string, JsonValue>,
  key: string
): Effect.Effect<string, DomainTag> {
  return Effect.try({
    try: () => requireStringPolicy(data, key),
    catch: (error) =>
      new InvalidError({ reason: errorMessage(error, "invalid") }),
  });
}

export function requireDomainUuidEffect(
  data: Record<string, JsonValue>,
  key: string
): Effect.Effect<string, DomainTag> {
  return Effect.try({
    try: () => requireUuidPolicy(data, key),
    catch: (error) =>
      new InvalidError({ reason: errorMessage(error, "invalid") }),
  });
}

export function requireDomainEnumEffect<T extends string>(
  value: string,
  allowed: readonly T[],
  label: string
): Effect.Effect<T, DomainTag> {
  return Effect.try({
    try: () => requireEnumPolicy(value, allowed, label),
    catch: (error) =>
      new InvalidError({ reason: errorMessage(error, "invalid") }),
  });
}

export function requireDomainEntitySlugEffect(
  data: Record<string, JsonValue>
): Effect.Effect<string, DomainTag> {
  return Effect.try({
    try: () => requireEntitySlugPolicy(data),
    catch: (error) =>
      new InvalidError({ reason: errorMessage(error, "invalid") }),
  });
}

/** Who a patch is applied for (Accept: the reviewer; agent graph write: the agent) and through which door. */
export type PatchActor = {
  actorId?: string | null;
  actorLabel?: string | null;
  /** Recorded on every history row the patch writes. */
  channel: Extract<GraphHistoryChannel, "triage_accept" | "agent_write">;
};

/**
 * One entry per applied op (ADR-0005 S4), appended in the patch transaction,
 * with the op's history row (`history.before`: `null` for a create, else the
 * `captureGraphRowEffect` snapshot taken before the write).
 */
export function appendPatchActivityEffect<K extends GraphRowActivityKind>(
  tx: DbTx,
  caseId: CaseId,
  actor: PatchActor,
  entry: Omit<GraphActivityInput<K>, "caseId" | "actorId" | "actorLabel"> & {
    history: Pick<GraphHistoryChange, "before">;
  }
): Effect.Effect<void, DomainTag> {
  const { history, ...activity } = entry;
  return appendGraphActivityEffect<K>(tx, {
    ...activity,
    caseId,
    actorId: actor.actorId ?? null,
    actorLabel: actor.actorLabel ?? null,
    history: { before: history.before, channel: actor.channel },
  });
}

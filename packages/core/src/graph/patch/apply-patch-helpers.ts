import { Effect } from "effect";

import type { DbTx } from "@watchdog/db";
import {
  requireEnum as requireEnumPolicy,
  requireEntitySlug as requireEntitySlugPolicy,
  requireString as requireStringPolicy,
  requireUuid as requireUuidPolicy,
} from "@watchdog/policy";
import type { JsonValue, CaseId } from "@watchdog/schemas/shared";

import { errorMessage } from "../../infra/error-utils";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import {
  appendGraphActivityEffect,
  type GraphActivityInput,
  type GraphActivityKind,
} from "../graph-activity";

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

/** Who a patch is applied for (Accept: the reviewer; agent graph write: the agent). */
export interface PatchActor {
  actorId?: string | null;
  actorLabel?: string | null;
}

/** One entry per applied op (ADR-0005 S4), appended in the patch transaction. */
export function appendPatchActivityEffect<K extends GraphActivityKind>(
  tx: DbTx,
  caseId: CaseId,
  actor: PatchActor,
  entry: Omit<GraphActivityInput<K>, "caseId" | "actorId" | "actorLabel">
): Effect.Effect<void, DomainTag> {
  return appendGraphActivityEffect(tx, {
    ...entry,
    caseId,
    actorId: actor.actorId ?? null,
    actorLabel: actor.actorLabel ?? null,
  });
}

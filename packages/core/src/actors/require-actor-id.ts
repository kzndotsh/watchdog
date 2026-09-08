import { Effect } from "effect";

import { parseActorId } from "@watchdog/schemas";

import { InvalidError, type DomainTag } from "../infra/tagged-errors";

/** Trim an optional actor id; absent/blank → undefined. */
export function optionalActorId(
  raw: string | null | undefined
): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  return parseActorId(raw);
}

/** Trim and require a non-blank actor id before job/evidence writes. */
export function requireActorIdEffect(
  actorId: string
): Effect.Effect<string, DomainTag> {
  const scoped = parseActorId(actorId);
  if (scoped === undefined) {
    return new InvalidError({ reason: "actorId is required" });
  }
  return Effect.succeed(scoped);
}

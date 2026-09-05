import { Effect } from "effect";
import type { z } from "zod";

import type { CapabilityDef } from "@watchdog/cap-sdk";
import {
  checkCapabilityAvailability,
  toCapDescriptor,
  type AvailabilityError,
  type AvailabilityResult,
} from "@watchdog/caps";
import { casesRepo, db } from "@watchdog/db";

import { tryDb } from "../infra/postgres-effect";
import { ForbiddenError, type DomainTag } from "../infra/tagged-errors";
import { hasCredentialEffect } from "../infra/vault";

function credentialNames(
  specs: NonNullable<ReturnType<typeof toCapDescriptor>["credentials"]>
): string[] {
  const names: string[] = [];
  for (const spec of specs) {
    if ("anyOf" in spec) {
      names.push(...spec.anyOf);
      continue;
    }
    names.push(spec.name);
  }
  return names;
}

export function formatCapAvailabilityError(
  err: AvailabilityError,
  capabilityId: string
): string {
  switch (err.kind) {
    case "egress_blocked": {
      return `Case does not permit third-party egress — enable it in Case settings or use a local model before running ${err.capabilityId}`;
    }
    case "missing_credential": {
      return err.names.length === 1
        ? `Missing credential ${err.names[0]} — set it in Settings before running ${capabilityId}`
        : `Missing credential — set one of ${err.names.join(" | ")} in Settings before running ${capabilityId}`;
    }
    default: {
      err satisfies never;
      return "Capability unavailable";
    }
  }
}

export function evaluateCapAvailabilityEffect(input: {
  actorId: string;
  caseId: string;
  cap: CapabilityDef<z.ZodType>;
}): Effect.Effect<
  {
    allowThirdPartyEgress: boolean;
    result: AvailabilityResult;
  },
  DomainTag
> {
  const desc = toCapDescriptor(input.cap);
  const specs = desc.credentials ?? [];
  const names = credentialNames(specs);

  return Effect.gen(function* evaluateCapAvailabilityGen() {
    const present = new Set<string>();
    yield* Effect.forEach(
      names,
      (name) =>
        hasCredentialEffect(input.actorId, name).pipe(
          Effect.tap((ok) =>
            Effect.sync(() => {
              if (ok) present.add(name);
            })
          )
        ),
      { concurrency: "unbounded" }
    );

    const caseRow = yield* tryDb(() =>
      casesRepo.getByIdUnchecked(db, input.caseId)
    );
    const allowThirdPartyEgress = caseRow?.allowThirdPartyEgress ?? false;
    return {
      allowThirdPartyEgress,
      result: checkCapabilityAvailability(
        {
          credentials: specs,
          egress: desc.egress ?? "none",
          flags: desc.flags ?? [],
        },
        {
          hasCredential: (name) => present.has(name),
          allowThirdPartyEgress,
          thirdPartyCapabilityId: input.cap.id,
        }
      ),
    };
  });
}

/** Fail closed before enqueue — same predicate as playbooks / worker preflight. */
export function assertCapAvailabilityEffect(input: {
  actorId: string;
  caseId: string;
  cap: CapabilityDef<z.ZodType>;
}): Effect.Effect<void, DomainTag> {
  return evaluateCapAvailabilityEffect(input).pipe(
    Effect.flatMap(({ result }) => {
      if (result.ok) return Effect.void;
      return new ForbiddenError({
        reason: formatCapAvailabilityError(result, input.cap.id),
      });
    })
  );
}

import { Effect } from "effect";
import type { z } from "zod";

import {
  checkCapabilityAvailability,
  toCapDescriptor,
  type AvailabilityError,
  type AvailabilityResult,
} from "@watchdog/caps";
import type { CapabilityDef } from "@watchdog/caps/sdk";
import { casesRepo } from "@watchdog/db";

import type { Db } from "../infra/db-service";
import { tryDbWith } from "../infra/postgres-effect";
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
  /** When set, skips a separate case read (use under case row lock). */
  allowThirdPartyEgress?: boolean;
}): Effect.Effect<
  {
    allowThirdPartyEgress: boolean;
    result: AvailabilityResult;
  },
  DomainTag,
  Db
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

    const caseRow =
      input.allowThirdPartyEgress === undefined
        ? yield* tryDbWith((exec) =>
            casesRepo.getByIdUnchecked(exec, input.caseId)
          )
        : null;
    const allowThirdPartyEgress =
      input.allowThirdPartyEgress ?? caseRow?.allowThirdPartyEgress ?? false;
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
  allowThirdPartyEgress?: boolean;
}): Effect.Effect<void, DomainTag, Db> {
  return evaluateCapAvailabilityEffect(input).pipe(
    Effect.flatMap(({ result }) => {
      if (result.ok) return Effect.void;
      return new ForbiddenError({
        reason: formatCapAvailabilityError(result, input.cap.id),
      });
    })
  );
}

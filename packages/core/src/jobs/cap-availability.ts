import { Effect } from "effect";
import type { z } from "zod";

import {
  checkCapabilityAvailability,
  toCapMetadata,
  type AvailabilityError,
  type AvailabilityResult,
} from "@watchdog/caps";
import type { CapabilityDef } from "@watchdog/caps/sdk";
import {
  DEFAULT_ALLOWED_EGRESS,
  formatEgressBlock,
} from "@watchdog/schemas/caps";
import type { CaseId, EgressClass } from "@watchdog/schemas/shared";

import {
  BREACH_DISABLED_MESSAGE,
  breachCapsEnabled,
} from "../caps/breach-caps";
import type { Db } from "../infra/db-service";
import { casesRepoFxDb } from "../infra/repos-fx";
import { ForbiddenError, type DomainTag } from "../infra/tagged-errors";
import { hasCredentialEffect, type Vault } from "../infra/vault";

function credentialNames(
  specs: NonNullable<ReturnType<typeof toCapMetadata>["credentials"]>
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
      return formatEgressBlock({
        capabilityId: err.capabilityId,
        classes: err.classes,
        destinations: err.destinations,
      });
    }
    case "breach_disabled": {
      return `${BREACH_DISABLED_MESSAGE} ${err.capabilityId}`;
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
  caseId: CaseId;
  cap: CapabilityDef<z.ZodType>;
  /** The Case's allowed egress classes; when set, skips a separate case read (use under case row lock). */
  allowedEgress?: readonly EgressClass[];
}): Effect.Effect<
  {
    allowedEgress: readonly EgressClass[];
    result: AvailabilityResult;
  },
  DomainTag,
  Db | Vault
> {
  const desc = toCapMetadata(input.cap);
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
      input.allowedEgress === undefined
        ? yield* casesRepoFxDb.getByIdUnchecked(input.caseId)
        : null;
    // A Case that cannot be read allows only what stays on the install and reaches the target.
    const allowedEgress =
      input.allowedEgress ?? caseRow?.allowedEgress ?? DEFAULT_ALLOWED_EGRESS;
    return {
      allowedEgress,
      result: checkCapabilityAvailability(
        {
          credentials: specs,
          egress: desc.egress,
          contacts: desc.contacts,
          flags: desc.flags ?? [],
        },
        {
          hasCredential: (name) => present.has(name),
          allowedEgress,
          breachCapsEnabled: breachCapsEnabled(),
          breachCapabilityId: input.cap.id,
          egressCapabilityId: input.cap.id,
        }
      ),
    };
  });
}

/** Fail closed before enqueue — same predicate as playbooks / worker preflight. */
export function assertCapAvailabilityEffect(input: {
  actorId: string;
  caseId: CaseId;
  cap: CapabilityDef<z.ZodType>;
  allowedEgress?: readonly EgressClass[];
}): Effect.Effect<void, DomainTag, Db | Vault> {
  return evaluateCapAvailabilityEffect(input).pipe(
    Effect.flatMap(({ result }) => {
      if (result.ok) return Effect.void;
      return new ForbiddenError({
        reason: formatCapAvailabilityError(result, input.cap.id),
      });
    })
  );
}

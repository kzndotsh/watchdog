import { randomUUID } from "node:crypto";

import type { CapInterpretResult } from "@watchdog/cap-sdk";
import {
  validateIdentifierValue,
  validateIdentifierWrite,
  type IdentifierType,
} from "@watchdog/schemas";

import { eligibleCtDomains } from "./eligible-domain-hosts";
import {
  INVALID_COLLECT_ENTITY_SUMMARY,
  resolveCollectEntityId,
} from "./resolve-collect-entity-id";

export interface IdentifierBatch {
  type: IdentifierType;
  values: readonly (string | null | undefined)[];
  platform?: string;
  /** Max Identifier ops for this batch (default 40). */
  limit?: number;
}

function valuesForBatch(
  batch: IdentifierBatch
): readonly (string | null | undefined)[] {
  if (batch.type !== "domain") return batch.values;
  const strings = batch.values.filter(
    (value): value is string => typeof value === "string" && value.trim() !== ""
  );
  return eligibleCtDomains(strings);
}

function identifierDedupKey(
  type: IdentifierType,
  platform: string,
  value: string
): string {
  return `${type}|${platform}|${value}`;
}

/**
 * Propose one or more typed Identifier batches + a single observation Claim.
 */
export function interpretIdentifierBatches(opts: {
  entityId: string | undefined;
  batches: readonly IdentifierBatch[];
  claimText: string;
  noEntitySummary: string;
}): CapInterpretResult {
  const entityId = resolveCollectEntityId(opts.entityId);
  if (entityId === null) {
    return { patch: [], summary: INVALID_COLLECT_ENTITY_SUMMARY };
  }
  if (entityId === undefined) {
    return { patch: [], summary: opts.noEntitySummary };
  }

  const patch: CapInterpretResult["patch"] = [];
  const seen = new Set<string>();

  for (const batch of opts.batches) {
    const limit = batch.limit ?? 40;
    let added = 0;
    for (const raw of valuesForBatch(batch)) {
      if (raw === null || raw === undefined || raw === "") continue;
      const parsed = validateIdentifierValue(batch.type, raw);
      if (!parsed.ok) continue;
      const written = validateIdentifierWrite({
        type: batch.type,
        value: parsed.value,
        platform: batch.platform ?? "",
      });
      if (!written.ok) continue;
      const key = identifierDedupKey(
        written.type,
        written.platform ?? "",
        written.value
      );
      if (seen.has(key)) continue;
      seen.add(key);
      const { value } = written;
      patch.push({
        op: "create",
        resource: "identifier",
        id: randomUUID(),
        data: {
          entityId,
          type: written.type,
          value,
          ...(written.platform ? { platform: written.platform } : {}),
        },
      });
      added += 1;
      if (added >= limit) break;
    }
  }

  const claimText = opts.claimText.trim();
  if (claimText !== "") {
    patch.push({
      op: "create",
      resource: "claim",
      id: randomUUID(),
      data: {
        entityId,
        text: claimText,
        class: "observation",
      },
    });
  }

  return {
    summary: claimText,
    patch,
  };
}

/** Single-type Identifier batch — thin wrapper over `interpretIdentifierBatches`. */
export function interpretTypedIdentifiers(opts: {
  entityId: string | undefined;
  type: IdentifierType;
  values: string[];
  claimText: string;
  noEntitySummary: string;
  platform?: string;
  limit?: number;
}): CapInterpretResult {
  const { type, values, platform, limit, ...rest } = opts;
  return interpretIdentifierBatches({
    ...rest,
    batches: [{ type, values, platform, limit }],
  });
}

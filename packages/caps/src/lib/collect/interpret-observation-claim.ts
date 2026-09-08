import { randomUUID } from "node:crypto";

import type { CapInterpretResult } from "@watchdog/cap-sdk";

import {
  INVALID_COLLECT_ENTITY_SUMMARY,
  resolveCollectEntityId,
} from "./resolve-collect-entity-id";

/**
 * Shared Collect interpret: attach a single observation Claim when entityId is set.
 * Cap-local `summarize()` builds `text` / empty summary — keep those outside.
 */
export function interpretObservationClaim(opts: {
  entityId: string | undefined;
  text: string;
  noEntitySummary: string;
}): CapInterpretResult {
  const entityId = resolveCollectEntityId(opts.entityId);
  if (entityId === null) {
    return { patch: [], summary: INVALID_COLLECT_ENTITY_SUMMARY };
  }
  if (entityId === undefined) {
    return { patch: [], summary: opts.noEntitySummary };
  }
  const text = opts.text.trim();
  if (text === "") {
    return { patch: [], summary: opts.noEntitySummary };
  }
  return {
    summary: text,
    patch: [
      {
        op: "create",
        resource: "claim",
        id: randomUUID(),
        data: {
          entityId,
          text,
          class: "observation",
        },
      },
    ],
  };
}

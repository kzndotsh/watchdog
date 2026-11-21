import { defineGraphChildMutation } from "@/domains/entities/hooks/use-graph-child-mutation";
import {
  buildUpdateIdentifierData,
  type UpdateIdentifierPatch,
} from "@/domains/entities/lib/identifier-write";
import type { EntityScope } from "@/domains/entities/types";
import { orpc } from "@/lib/orpc-client";
import {
  TOAST_IDENTIFIER_ADDED,
  TOAST_IDENTIFIER_UPDATED,
} from "@/shared/lib/toast-copy";
import {
  normalizeIdentifierPlatform,
  type ConfidenceTier,
  type IdentifierStatus,
  type IdentifierType,
} from "@watchdog/domain/schemas/shared";

export type CreateIdentifierVariables = EntityScope & {
  value: {
    type: IdentifierType;
    value: string;
    platform: string;
    status: IdentifierStatus;
    confidence: ConfidenceTier;
    evidenceIds: string[];
  };
};

/** Add an Identifier to an Entity. */
export const useCreateIdentifier = defineGraphChildMutation({
  call: orpc.identifiers.create.call,
  parse: ({ caseId, entityId, value }: CreateIdentifierVariables) => ({
    caseId,
    entityId,
    type: value.type,
    value: value.value,
    platform: normalizeIdentifierPlatform(value.platform) || undefined,
    status: value.status,
    confidence: value.confidence,
    evidenceIds: value.evidenceIds,
  }),
  success: TOAST_IDENTIFIER_ADDED,
  verb: "add",
  noun: "identifier",
});

export type UpdateIdentifierVariables = EntityScope & {
  patch: UpdateIdentifierPatch;
};

/** Edit an Identifier. */
export const useUpdateIdentifier = defineGraphChildMutation({
  call: orpc.identifiers.update.call,
  parse: ({ caseId, patch }: UpdateIdentifierVariables) =>
    buildUpdateIdentifierData(caseId, patch),
  success: TOAST_IDENTIFIER_UPDATED,
  verb: "update",
  noun: "identifier",
});

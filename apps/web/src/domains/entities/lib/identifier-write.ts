import {
  createIdentifierInputSchema,
  updateIdentifierInputSchema,
  type CreateIdentifierInput,
  type UpdateIdentifierInput,
} from "@/domains/entities/identifiers/types";
import type {
  ConfidenceTier,
  IdentifierStatus,
  IdentifierType,
} from "@watchdog/schemas";

export interface CreateIdentifierPatch {
  entityId: string;
  type: IdentifierType;
  value: string;
  confidence: ConfidenceTier;
  platform?: string;
  status?: IdentifierStatus;
  notes?: string;
  evidenceIds?: string[];
}

export interface UpdateIdentifierPatch {
  identifierId: string;
  value?: string;
  platform?: string;
  type?: IdentifierType;
  status?: IdentifierStatus;
  confidence?: ConfidenceTier;
  notes?: string;
  evidenceIds?: string[];
}

/** Normalize dossier/table identifier POST payloads at ingress. */
export function buildCreateIdentifierData(
  caseId: string,
  input: CreateIdentifierPatch
): CreateIdentifierInput {
  return createIdentifierInputSchema.parse({
    caseId,
    ...input,
  });
}

/** Normalize dossier/table identifier PATCH payloads at ingress. */
export function buildUpdateIdentifierData(
  caseId: string,
  input: UpdateIdentifierPatch
): UpdateIdentifierInput {
  const { identifierId, notes, platform, evidenceIds, ...rest } = input;
  return updateIdentifierInputSchema.parse({
    caseId,
    identifierId,
    ...rest,
    ...(notes === undefined ? {} : { notes }),
    ...(platform === undefined ? {} : { platform }),
    ...(evidenceIds === undefined ? {} : { evidenceIds }),
  });
}

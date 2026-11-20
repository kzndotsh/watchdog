import type { ClaimFormValues } from "@/domains/entities/claims/types";
import { defineGraphChildMutation } from "@/domains/entities/hooks/use-graph-child-mutation";
import type { EntityScope } from "@/domains/entities/types";
import { orpc } from "@/lib/orpc-client";
import type { RetractKind } from "@watchdog/schemas/shared";

export type CreateClaimVariables = EntityScope & { value: ClaimFormValues };

/** Add a Claim to an Entity. */
export const useCreateClaim = defineGraphChildMutation({
  call: orpc.claims.create.call,
  parse: ({ caseId, entityId, value }: CreateClaimVariables) => ({
    caseId,
    entityId,
    text: value.text,
    class: value.claimClass,
    confidence: value.confidence,
    evidenceIds: value.evidenceIds,
  }),
  success: "Claim saved",
  verb: "save",
  noun: "claim",
});

export type UpdateClaimVariables = EntityScope & {
  claimId: string;
  /** The Claim's `version` when the editor opened; the save fails as stale if it moved on. */
  expectedVersion: number;
  value: ClaimFormValues;
};

/** Edit a Claim. */
export const useUpdateClaim = defineGraphChildMutation({
  call: orpc.claims.update.call,
  parse: ({
    caseId,
    claimId,
    expectedVersion,
    value,
  }: UpdateClaimVariables) => ({
    caseId,
    claimId,
    expectedVersion,
    text: value.text,
    class: value.claimClass,
    confidence: value.confidence,
    evidenceIds: value.evidenceIds,
  }),
  success: "Claim updated",
  verb: "update",
  noun: "claim",
});

export type RetractClaimVariables = EntityScope & {
  claimId: string;
  kind: RetractKind;
  reason: string;
};

const RETRACT_SUCCESS: Record<RetractKind, string> = {
  contested: "Claim contested",
  disproved: "Claim disproved",
  retracted: "Claim retracted",
};

/** Contest, disprove or retract a Claim; the toast names which. */
export const useRetractClaim = defineGraphChildMutation({
  call: orpc.claims.retract.call,
  parse: ({ caseId, claimId, kind, reason }: RetractClaimVariables) => ({
    caseId,
    claimId,
    kind,
    reason,
  }),
  success: ({ kind }: RetractClaimVariables) => RETRACT_SUCCESS[kind],
  verb: "retract",
  noun: "claim",
});

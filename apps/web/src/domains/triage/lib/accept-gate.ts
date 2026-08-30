import {
  isConfirmedWithoutBundle,
  totalEvidenceCount,
} from "@/domains/triage/lib/accept-validation";
import type { ProposalRecord } from "@/domains/triage/triage.functions";
import type { ConfidenceTier, PatchOp } from "@watchdog/schemas";
import { listInvalidIdentifierOps } from "@watchdog/schemas";

export type AcceptGateStatus = "ready" | "needs" | "blocked";

export interface GatedAcceptInput {
  readonly confidence: ConfidenceTier;
  readonly evidenceIds: readonly string[];
  readonly linkedIds: readonly string[];
  readonly attestationText: string;
  readonly patch: readonly PatchOp[];
  readonly needsConfidence: boolean;
  readonly identifierCollisions: ProposalRecord["identifierCollisions"];
}

export interface AcceptGateResult {
  readonly status: AcceptGateStatus;
  readonly canAccept: boolean;
  readonly confirmedWithoutBundle: boolean;
  readonly zeroEvidenceWarn: boolean;
  readonly hasInvalidIdentifierOps: boolean;
  readonly collisionCount: number;
}

/** Single constructor for accept-gate inputs — do not spread ad hoc fields at call sites. */
export function gatedAcceptInput(input: GatedAcceptInput): GatedAcceptInput {
  return input;
}

export function acceptGate(input: GatedAcceptInput): AcceptGateResult {
  const invalidIdentifierOps = listInvalidIdentifierOps(input.patch);
  const hasInvalidIdentifierOps = invalidIdentifierOps.length > 0;
  const confirmedWithoutBundle =
    input.needsConfidence &&
    isConfirmedWithoutBundle(
      input.confidence,
      [...input.evidenceIds],
      [...input.linkedIds],
      input.attestationText
    );
  const totalEvidence = totalEvidenceCount(
    [...input.evidenceIds],
    [...input.linkedIds],
    input.attestationText
  );
  const zeroEvidenceWarn =
    input.confidence !== "confirmed" && totalEvidence === 0;
  const collisionCount = input.identifierCollisions?.length ?? 0;

  if (hasInvalidIdentifierOps || confirmedWithoutBundle) {
    return {
      status: "blocked",
      canAccept: false,
      confirmedWithoutBundle,
      zeroEvidenceWarn,
      hasInvalidIdentifierOps,
      collisionCount,
    };
  }

  if (zeroEvidenceWarn) {
    return {
      status: "needs",
      canAccept: true,
      confirmedWithoutBundle,
      zeroEvidenceWarn,
      hasInvalidIdentifierOps,
      collisionCount,
    };
  }

  return {
    status: "ready",
    canAccept: true,
    confirmedWithoutBundle,
    zeroEvidenceWarn,
    hasInvalidIdentifierOps,
    collisionCount,
  };
}

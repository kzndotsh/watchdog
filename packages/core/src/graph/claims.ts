import { Effect } from "effect";

import type {
  CaseId,
  ClaimClass,
  ConfidenceTier,
  OrganizationId,
  RetractKind,
  GraphActor,
} from "@watchdog/schemas/shared";
import { trimmedOrUndefined } from "@watchdog/schemas/shared";

import { requireActorIdEffect } from "../actors/require-actor-id";
import { parseGraphEvidenceIdsEffect } from "../evidence/evidence";
import type { Db } from "../infra/db-service";
import {
  ConflictError,
  InvalidError,
  type DomainTag,
} from "../infra/tagged-errors";
import { dossierChannel } from "./graph-activity";
import { runGraphMutation } from "./mutation/run-graph-mutation";
import { claimsTable, retractClaim, type ClaimRecord } from "./mutation/tables";
import {
  assertConfidenceEvidenceEffect,
  assertEntityInCaseEffect,
  requireTrimmedGraphId,
} from "./patch/guards";

export type { ClaimRecord };

export type CreateClaimInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  entityId: string;
  text: string;
  confidence: ConfidenceTier;
  class: ClaimClass;
  evidenceIds?: string[];
} & GraphActor;

export type UpdateClaimInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  claimId: string;
  /** The `version` the caller last read; an update of a row that moved on is `StaleVersionError`. */
  expectedVersion: number;
  text?: string;
  class?: ClaimClass;
  confidence?: ConfidenceTier;
  evidenceIds?: string[];
} & GraphActor;

export type RetractClaimInput = {
  actorLabel?: string;
  actorKeyId?: string;
  caseId: CaseId;
  organizationId: OrganizationId;
  claimId: string;
  kind: RetractKind;
  reason: string;
};

export function createClaimEffect(
  input: CreateClaimInput
): Effect.Effect<ClaimRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) =>
      Effect.gen(function* createClaimGen() {
        const entityId = yield* requireTrimmedGraphId(input.entityId, "Entity");
        const text = trimmedOrUndefined(input.text);
        if (text === undefined) {
          return yield* new InvalidError({ reason: "Claim text is required" });
        }
        const evidenceIds = yield* parseGraphEvidenceIdsEffect(
          input.evidenceIds ?? []
        );
        yield* assertConfidenceEvidenceEffect(input.confidence, evidenceIds);
        yield* assertEntityInCaseEffect(w.caseId, entityId, w.tx);
        return yield* w.insert(
          claimsTable,
          {
            entityId,
            text,
            confidence: input.confidence,
            class: input.class,
          },
          { evidence: evidenceIds }
        );
      })
  );
}

export function retractClaimEffect(
  input: RetractClaimInput,
  actorId: string
): Effect.Effect<ClaimRecord, DomainTag, Db> {
  const actor = {
    actorId,
    actorLabel: input.actorLabel,
    actorKeyId: input.actorKeyId,
  };
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor,
      channel: dossierChannel(actor),
    },
    (w) =>
      Effect.gen(function* retractClaimGen() {
        const claimId = yield* requireTrimmedGraphId(input.claimId, "Claim");
        const reason = trimmedOrUndefined(input.reason);
        if (reason === undefined) {
          return yield* new InvalidError({
            reason: "Retraction reason is required",
          });
        }
        const existing = yield* w.get(claimsTable, claimId);
        if (existing.retracted) {
          return yield* new ConflictError({
            reason: "Claim already retracted",
          });
        }
        const retractedBy = yield* requireActorIdEffect(actorId);
        return yield* w.transition(
          claimsTable,
          claimId,
          retractClaim,
          {
            retractKind: input.kind,
            retractedReason: reason,
            retractedBy,
          },
          { toValue: input.kind }
        );
      })
  );
}

export function updateClaimEffect(
  input: UpdateClaimInput
): Effect.Effect<ClaimRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) =>
      Effect.gen(function* updateClaimGen() {
        const existing = yield* w.get(claimsTable, input.claimId);
        if (existing.retracted) {
          return yield* new ConflictError({
            reason: "Claim already retracted",
          });
        }
        if (
          input.text === undefined &&
          input.class === undefined &&
          input.confidence === undefined &&
          input.evidenceIds === undefined
        ) {
          return yield* new InvalidError({ reason: "Nothing to update" });
        }
        const nextText =
          input.text === undefined ? undefined : trimmedOrUndefined(input.text);
        if (input.text !== undefined && nextText === undefined) {
          return yield* new InvalidError({ reason: "Claim text is required" });
        }

        const updated = yield* w.update(
          claimsTable,
          existing.id,
          {
            ...(nextText === undefined ? {} : { text: nextText }),
            ...(input.class === undefined ? {} : { class: input.class }),
            ...(input.confidence === undefined
              ? {}
              : { confidence: input.confidence }),
          },
          {
            expectedVersion: input.expectedVersion,
            ...(input.evidenceIds === undefined
              ? {}
              : { evidence: input.evidenceIds }),
          }
        );
        // The policy reads the Evidence the Claim now has; a violation rolls the edit back.
        yield* assertConfidenceEvidenceEffect(
          updated.confidence,
          updated.evidenceIds
        );
        return updated;
      })
  );
}

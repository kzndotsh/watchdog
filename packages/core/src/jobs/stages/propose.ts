import { Effect } from "effect";

import { casesRepo, db, proposalsRepo } from "@watchdog/db";
import {
  parseGraphUuidList,
  trimmedOrUndefined,
  type PatchOp,
} from "@watchdog/schemas";

import { attachEvidenceIds } from "../../graph/attach-evidence";
import { tryDb } from "../../infra/postgres-effect";
import { transact } from "../../infra/postgres-tx";
import {
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../../infra/tagged-errors";
import { suppressKnownFindingsEffect } from "../../proposals/finding-suppress";

export interface ProposeResult {
  proposalId: string | null;
  resultSummary: string | null;
  suppressedCount: number;
}

export interface ProposeStageInput {
  caseId: string;
  kept: PatchOp[];
  suppressed: number;
  /** Cap-owned prose only — all-known lives in `suppressedCount`, not the string. */
  resultSummary: string | null;
  attachEvidenceIds: string[];
  /** Cap Jobs set this; agent propose leaves null. */
  jobId?: string | null;
  agentSourced?: boolean;
  createdBy?: string | null;
}

export interface SuppressAndProposeStageInput {
  caseId: string;
  patch: PatchOp[];
  resultSummary: string | null;
  attachEvidenceIds: string[];
  jobId?: string | null;
  agentSourced?: boolean;
  createdBy?: string | null;
  onSuppressed?: (suppressed: number) => void;
}

export interface SuppressAndProposeResult extends ProposeResult {
  kept: PatchOp[];
}

function createdByForProposal(
  createdBy: string | null | undefined
): string | null {
  if (createdBy === undefined || createdBy === null) return null;
  return trimmedOrUndefined(createdBy) ?? null;
}

/** Lock the Case, suppress known findings, and insert a pending Proposal atomically. */
export function suppressAndProposeStageEffect(
  input: SuppressAndProposeStageInput
): Effect.Effect<SuppressAndProposeResult, DomainTag> {
  if (input.patch.length === 0) {
    return Effect.succeed({
      proposalId: null,
      resultSummary: input.resultSummary,
      suppressedCount: 0,
      kept: [],
    });
  }

  return transact((tx) =>
    Effect.gen(function* suppressAndProposeGen() {
      const locked = yield* tryDb(() => casesRepo.lockById(tx, input.caseId));
      if (!locked) {
        return yield* new NotFoundError({ resource: "Case not found" });
      }

      const { kept, suppressed } = yield* suppressKnownFindingsEffect(
        input.caseId,
        input.patch,
        tx
      );
      if (input.onSuppressed !== undefined && suppressed > 0) {
        yield* Effect.sync(() => {
          input.onSuppressed?.(suppressed);
        });
      }

      if (kept.length === 0) {
        return {
          proposalId: null,
          resultSummary: input.resultSummary,
          suppressedCount: suppressed,
          kept,
        };
      }

      const sharedEvidenceIds = parseGraphUuidList(input.attachEvidenceIds);
      if (sharedEvidenceIds === null) {
        return yield* new InvalidError({
          reason: "attachEvidenceIds contains an invalid UUID",
        });
      }
      const attached = attachEvidenceIds(kept, sharedEvidenceIds);
      if (!attached.ok) {
        return yield* new InvalidError({ reason: attached.error });
      }
      const withEvidence = attached.patch;
      const prop = yield* tryDb(() =>
        proposalsRepo.create(tx, {
          caseId: input.caseId,
          jobId: input.jobId ?? null,
          status: "pending",
          patch: withEvidence,
          summary: input.resultSummary,
          suppressedCount: suppressed,
          evidenceIds: sharedEvidenceIds,
          agentSourced: input.agentSourced ?? false,
          userOverridden: false,
          createdBy: createdByForProposal(input.createdBy),
        })
      );
      return {
        proposalId: prop?.id ?? null,
        resultSummary: input.resultSummary,
        suppressedCount: suppressed,
        kept,
      };
    })
  );
}

/** Insert a pending Proposal with evidence attached to claim/identifier/edge ops. */
export function proposeStageEffect(
  input: ProposeStageInput
): Effect.Effect<ProposeResult, DomainTag> {
  if (input.kept.length === 0) {
    return Effect.succeed({
      proposalId: null,
      resultSummary: input.resultSummary,
      suppressedCount: input.suppressed,
    });
  }

  const sharedEvidenceIds = parseGraphUuidList(input.attachEvidenceIds);
  if (sharedEvidenceIds === null) {
    return new InvalidError({
      reason: "attachEvidenceIds contains an invalid UUID",
    });
  }
  const attached = attachEvidenceIds(input.kept, sharedEvidenceIds);
  if (!attached.ok) {
    return new InvalidError({ reason: attached.error });
  }
  const withEvidence = attached.patch;

  return Effect.gen(function* proposeStageGen() {
    const prop = yield* tryDb(() =>
      proposalsRepo.create(db, {
        caseId: input.caseId,
        jobId: input.jobId ?? null,
        status: "pending",
        patch: withEvidence,
        summary: input.resultSummary,
        suppressedCount: input.suppressed,
        evidenceIds: sharedEvidenceIds,
        agentSourced: input.agentSourced ?? false,
        userOverridden: false,
        createdBy: createdByForProposal(input.createdBy),
      })
    );
    return {
      proposalId: prop?.id ?? null,
      resultSummary: input.resultSummary,
      suppressedCount: input.suppressed,
    };
  });
}

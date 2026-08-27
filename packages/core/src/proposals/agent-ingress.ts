import { db, graphWritesRepo } from "@watchdog/db";
import { trimmedOrNull } from "@watchdog/schemas";

import { assertEvidenceInCase, createAttestation } from "../evidence/evidence";
import { applyPatch } from "../graph/patch/apply-patch";
import { assertCaseExists } from "../graph/patch/guards";
import { parseAgentPatch } from "../graph/patch/parse-agent-patch";
import { DomainError, isUniqueViolation } from "../infra/domain-error";
import { notifyEvent } from "../infra/events";
import { logSwallowed } from "../infra/process-log";
import { proposeStage } from "../jobs/stages/propose";
import { suppressKnownFindings } from "./finding-suppress";
import { getProposalForCase, type ProposalRecord } from "./proposals";

const GRAPH_WRITE_IDEMPOTENCY_INDEX = "graph_writes_case_actor_idem_uidx";

function findGraphWriteByIdempotency(input: {
  caseId: string;
  actorId: string;
  idempotencyKey: string;
}): Promise<string | null> {
  return graphWritesRepo.findIdByIdempotency(db, input);
}

export function createAgentProposal(input: {
  caseId: string;
  actorId: string;
  patch: unknown;
  summary?: string;
  evidenceIds?: string[];
}): Promise<{ proposal: ProposalRecord }> {
  return (async () => {
    const plan = parseAgentPatch({
      patch: input.patch,
      summary: input.summary,
      evidenceIds: input.evidenceIds,
    });
    if (!plan.ok) throw new DomainError("invalid", plan.error);

    await assertCaseExists(input.caseId);
    await assertEvidenceInCase(input.caseId, plan.evidenceIds);

    const { kept, suppressed } = await suppressKnownFindings(
      input.caseId,
      plan.patch
    );
    if (kept.length === 0) {
      throw new DomainError(
        suppressed > 0 ? "conflict" : "invalid",
        suppressed > 0
          ? `All ${suppressed} finding(s) already known or previously rejected — no Proposal`
          : "patch produced no findings"
      );
    }

    const proposed = await proposeStage({
      caseId: input.caseId,
      kept,
      suppressed,
      resultSummary: plan.summary,
      attachEvidenceIds: plan.evidenceIds,
      agentSourced: true,
      createdBy: input.actorId,
    });

    if (proposed.proposalId === null || proposed.proposalId === "") {
      throw new DomainError("invalid", "Failed to create Proposal");
    }

    void notifyEvent({
      type: "proposal_created",
      caseId: input.caseId,
      proposalId: proposed.proposalId,
    }).catch((error: unknown) => {
      logSwallowed("notify.proposal_created", error, {
        caseId: input.caseId,
        proposalId: proposed.proposalId,
      });
    });

    const proposal = await getProposalForCase(
      input.caseId,
      proposed.proposalId
    );
    if (!proposal) {
      throw new DomainError("not_found", "Proposal created but not readable");
    }
    return { proposal };
  })();
}

export function writeGraphFromAgent(input: {
  caseId: string;
  actorId: string;
  patch: unknown;
  summary?: string;
  evidenceIds?: string[];
  userOverride: true;
  idempotencyKey?: string;
}): Promise<{
  writeId: string;
  confidence: "unverified";
  opCount: number;
  replayed: boolean;
}> {
  return (async () => {
    if (!input.userOverride) {
      throw new DomainError(
        "invalid",
        "userOverride must be true for graph write"
      );
    }

    const plan = parseAgentPatch({
      patch: input.patch,
      summary: input.summary,
      evidenceIds: input.evidenceIds,
    });
    if (!plan.ok) throw new DomainError("invalid", plan.error);

    await assertCaseExists(input.caseId);
    await assertEvidenceInCase(input.caseId, plan.evidenceIds);

    const idempotencyKey = trimmedOrNull(input.idempotencyKey);
    if (idempotencyKey !== null) {
      const existingId = await findGraphWriteByIdempotency({
        caseId: input.caseId,
        actorId: input.actorId,
        idempotencyKey,
      });
      if (existingId !== null && existingId !== "") {
        return {
          writeId: existingId,
          confidence: "unverified",
          opCount: 0,
          replayed: true,
        };
      }
    }

    try {
      const writeId = await db.transaction(async (tx) => {
        const sharedEvidenceIds = [...plan.evidenceIds];

        if (plan.summary !== null && plan.summary !== "") {
          const attestation = await createAttestation({
            caseId: input.caseId,
            text: plan.summary,
            actorId: input.actorId,
            label: "Agent graph write",
            tx,
          });
          sharedEvidenceIds.push(attestation.id);
        }

        const write = await graphWritesRepo.create(tx, {
          caseId: input.caseId,
          actorId: input.actorId,
          channel: "agent_write",
          userOverridden: true,
          confidence: "unverified",
          summary: plan.summary,
          patch: plan.patch,
          idempotencyKey,
        });

        if (!write)
          throw new DomainError("invalid", "Failed to record graph write");

        await applyPatch({
          caseId: input.caseId,
          patch: plan.patch,
          confidence: "unverified",
          sharedEvidenceIds,
          tx,
        });

        return write.id;
      });

      void notifyEvent({
        type: "entity_changed",
        caseId: input.caseId,
      }).catch((error: unknown) => {
        logSwallowed("notify.entity_changed", error, { caseId: input.caseId });
      });

      return {
        writeId,
        confidence: "unverified",
        opCount: plan.patch.length,
        replayed: false,
      };
    } catch (error) {
      if (
        idempotencyKey !== null &&
        isUniqueViolation(error, GRAPH_WRITE_IDEMPOTENCY_INDEX)
      ) {
        const existingId = await findGraphWriteByIdempotency({
          caseId: input.caseId,
          actorId: input.actorId,
          idempotencyKey,
        });
        if (existingId !== null && existingId !== "") {
          return {
            writeId: existingId,
            confidence: "unverified",
            opCount: 0,
            replayed: true,
          };
        }
      }
      throw error;
    }
  })();
}

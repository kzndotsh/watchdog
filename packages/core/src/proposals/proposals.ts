import {
  db,
  entitiesRepo,
  proposalsRepo,
  type ProposalRow,
} from "@watchdog/db";
import type {
  ConfidenceTier,
  PatchOp,
  ProposalStatus,
} from "@watchdog/schemas";
import { trimmedOrNull } from "@watchdog/schemas";

import { assertEvidenceInCase, createAttestation } from "../evidence/evidence";
import {
  loadIdentifierCollisions,
  type IdentifierCollision,
} from "../graph/identifier-collisions";
import { applyPatch } from "../graph/patch/apply-patch";
import { DomainError } from "../infra/domain-error";
import { notifyEntityChanged } from "../infra/events";
import { recordRejectedFingerprints } from "./finding-suppress";

export interface ProposalRecord {
  id: string;
  caseId: string;
  jobId: string | null;
  capabilityId: string | null;
  status: ProposalStatus;
  patch: PatchOp[];
  summary: string | null;
  suppressedCount: number;
  evidenceIds: string[];
  rejectReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  /** True when arrived via agent propose API (not Cap Jobs). */
  agentSourced: boolean;
  /**
   * Deprecated as override vehicle — never set on new paths.
   * Agent Graph writes audit via graph_writes.
   */
  userOverridden: boolean;
  /** Actor who created the Proposal; Cap Jobs leave null. */
  createdBy: string | null;
  /** entityId → name map for display purposes */
  entityNames?: Record<string, string>;
  /** entityId → dossier slug map for display links */
  entitySlugs?: Record<string, string>;
  /** Identifier ops whose type+value already exist on another Entity. */
  identifierCollisions?: IdentifierCollision[];
}

function entityIdsFromPatch(patch: PatchOp[]): Set<string> {
  const entityIds = new Set<string>();
  for (const op of patch) {
    const d = op.data as Record<string, unknown>;
    if (typeof d.entityId === "string") entityIds.add(d.entityId);
    if (typeof d.fromId === "string") entityIds.add(d.fromId);
    if (typeof d.toId === "string") entityIds.add(d.toId);
  }
  return entityIds;
}

async function loadEntityDisplayMaps(entityIds: Iterable<string>): Promise<{
  entityNames: Record<string, string>;
  entitySlugs: Record<string, string>;
}> {
  const ids = [...entityIds];
  const entityNames: Record<string, string> = {};
  const entitySlugs: Record<string, string> = {};
  if (ids.length === 0) {
    return { entityNames, entitySlugs };
  }
  const ents = await entitiesRepo.listNamesByIds(db, ids);
  for (const e of ents) {
    entityNames[e.id] = e.name;
    entitySlugs[e.id] = e.slug;
  }
  return { entityNames, entitySlugs };
}

function toRecord(
  row: ProposalRow,
  opts?: {
    entityNames?: Record<string, string>;
    entitySlugs?: Record<string, string>;
    capabilityId?: string | null;
    identifierCollisions?: IdentifierCollision[];
  }
): ProposalRecord {
  return {
    id: row.id,
    caseId: row.caseId,
    jobId: row.jobId,
    capabilityId: opts?.capabilityId ?? null,
    status: row.status,
    patch: row.patch,
    summary: row.summary,
    suppressedCount: row.suppressedCount,
    evidenceIds: row.evidenceIds ?? [],
    rejectReason: row.rejectReason,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    agentSourced: row.agentSourced,
    userOverridden: row.userOverridden,
    createdBy: row.createdBy ?? null,
    entityNames: opts?.entityNames ?? {},
    entitySlugs: opts?.entitySlugs ?? {},
    identifierCollisions: opts?.identifierCollisions ?? [],
  };
}

export function listProposalsForCase(
  caseId: string,
  opts?: { status?: ProposalStatus }
): Promise<ProposalRecord[]> {
  return (async () => {
    const rows = await proposalsRepo.listForCase(db, caseId, opts);

    const entityIds = new Set<string>();
    for (const { proposal } of rows) {
      for (const id of entityIdsFromPatch(proposal.patch)) {
        entityIds.add(id);
      }
    }

    const { entityNames, entitySlugs } = await loadEntityDisplayMaps(entityIds);

    const collisionsByIndex = await loadIdentifierCollisions(
      caseId,
      rows.map(({ proposal }) => proposal.patch)
    );

    return rows.map(({ proposal, capabilityId }, i) =>
      toRecord(proposal, {
        entityNames,
        entitySlugs,
        capabilityId,
        identifierCollisions: collisionsByIndex[i] ?? [],
      })
    );
  })();
}

export async function getProposalForCase(
  caseId: string,
  proposalId: string
): Promise<ProposalRecord | null> {
  const row = await proposalsRepo.getInCase(db, caseId, proposalId);
  if (!row) return null;
  const [collisions] = await loadIdentifierCollisions(caseId, [
    row.proposal.patch,
  ]);
  const { entityNames, entitySlugs } = await loadEntityDisplayMaps(
    entityIdsFromPatch(row.proposal.patch)
  );
  return toRecord(row.proposal, {
    entityNames,
    entitySlugs,
    capabilityId: row.capabilityId,
    identifierCollisions: collisions ?? [],
  });
}

export function acceptProposal(input: {
  caseId: string;
  proposalId: string;
  actorId: string;
  confidence?: ConfidenceTier;
  sharedEvidenceIds?: string[];
  /** Optional paste → creates attestation Evidence and appends to shared ids. */
  attestationText?: string;
}): Promise<ProposalRecord> {
  return (async () => {
    const shared = [...new Set(input.sharedEvidenceIds)];

    const updated = await db.transaction(async (tx) => {
      const pending = await proposalsRepo.lockInCase(
        tx,
        input.caseId,
        input.proposalId
      );
      if (!pending) {
        throw new DomainError("not_found", "Proposal not found");
      }
      if (pending.status !== "pending") {
        throw new DomainError(
          "conflict",
          `Proposal is already ${pending.status}`
        );
      }

      await assertEvidenceInCase(input.caseId, shared, tx);

      const sharedInTx = [...shared];
      const attestationText = input.attestationText?.trim();
      if (attestationText !== undefined && attestationText !== "") {
        const attestation = await createAttestation({
          caseId: input.caseId,
          text: attestationText,
          actorId: input.actorId,
          tx,
        });
        sharedInTx.push(attestation.id);
      }

      await applyPatch({
        caseId: input.caseId,
        patch: pending.patch,
        confidence: input.confidence,
        sharedEvidenceIds: [
          ...new Set([...sharedInTx, ...(pending.evidenceIds ?? [])]),
        ],
        tx,
      });

      const accepted = await proposalsRepo.accept(tx, input.proposalId, {
        decidedBy: input.actorId,
        decidedAt: new Date(),
      });

      if (!accepted) {
        throw new DomainError("conflict", "Proposal is not pending");
      }
      return accepted;
    });

    notifyEntityChanged(input.caseId);
    return toRecord(updated);
  })();
}

export function rejectProposal(input: {
  caseId: string;
  proposalId: string;
  actorId: string;
  reason?: string;
}): Promise<ProposalRecord> {
  return (async () => {
    const updated = await db.transaction(async (tx) => {
      const existing = await proposalsRepo.lockInCase(
        tx,
        input.caseId,
        input.proposalId
      );
      if (!existing) {
        throw new DomainError("not_found", "Proposal not found");
      }

      const rejected = await proposalsRepo.reject(
        tx,
        input.caseId,
        input.proposalId,
        {
          rejectReason: trimmedOrNull(input.reason),
          decidedBy: input.actorId,
          decidedAt: new Date(),
        }
      );

      if (!rejected) {
        throw new DomainError(
          "conflict",
          `Proposal is already ${existing.status}`
        );
      }

      await recordRejectedFingerprints({
        caseId: input.caseId,
        proposalId: rejected.id,
        patch: rejected.patch,
        tx,
      });

      return rejected;
    });

    return toRecord(updated);
  })();
}

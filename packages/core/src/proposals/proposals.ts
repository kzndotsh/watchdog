import { Effect } from "effect";

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

import {
  labelForActor,
  loadActorUsersEffect,
} from "../actors/resolve-actor-labels";
import {
  assertEvidenceIdsInCaseEffect,
  createAttestationEffect,
} from "../evidence/evidence";
import {
  loadIdentifierCollisionsEffect,
  type IdentifierCollision,
} from "../graph/identifier-collisions";
import { applyPatchEffect } from "../graph/patch/apply-patch";
import { notifyEntityChangedEffect } from "../infra/events";
import { tryDb } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  ConflictError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
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
  createdByLabel: string | null;
  decidedByLabel: string | null;
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

function loadEntityDisplayMapsEffect(
  entityIds: Iterable<string>
): Effect.Effect<
  {
    entityNames: Record<string, string>;
    entitySlugs: Record<string, string>;
  },
  DomainTag
> {
  const ids = [...entityIds];
  if (ids.length === 0) {
    return Effect.succeed({ entityNames: {}, entitySlugs: {} });
  }
  return tryDb(() => entitiesRepo.listNamesByIds(db, ids)).pipe(
    Effect.map((ents) => {
      const entityNames: Record<string, string> = {};
      const entitySlugs: Record<string, string> = {};
      for (const e of ents) {
        entityNames[e.id] = e.name;
        entitySlugs[e.id] = e.slug;
      }
      return { entityNames, entitySlugs };
    })
  );
}

function toRecord(
  row: ProposalRow,
  opts?: {
    entityNames?: Record<string, string>;
    entitySlugs?: Record<string, string>;
    capabilityId?: string | null;
    identifierCollisions?: IdentifierCollision[];
    users?: ReadonlyMap<string, { name: string; email: string }>;
  }
): ProposalRecord {
  const users = opts?.users ?? new Map();
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
    decidedByLabel: row.decidedBy ? labelForActor(row.decidedBy, users) : null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    agentSourced: row.agentSourced,
    userOverridden: row.userOverridden,
    createdBy: row.createdBy ?? null,
    createdByLabel: row.createdBy ? labelForActor(row.createdBy, users) : null,
    entityNames: opts?.entityNames ?? {},
    entitySlugs: opts?.entitySlugs ?? {},
    identifierCollisions: opts?.identifierCollisions ?? [],
  };
}

export function listProposalsForCaseEffect(
  caseId: string,
  opts?: { status?: ProposalStatus }
): Effect.Effect<ProposalRecord[], DomainTag> {
  return Effect.gen(function* listProposalsForCaseGen() {
    const rows = yield* tryDb(() =>
      proposalsRepo.listForCase(db, caseId, opts)
    );

    const entityIds = new Set<string>();
    for (const { proposal } of rows) {
      for (const id of entityIdsFromPatch(proposal.patch)) {
        entityIds.add(id);
      }
    }

    const { entityNames, entitySlugs } =
      yield* loadEntityDisplayMapsEffect(entityIds);

    const collisionsByIndex = yield* loadIdentifierCollisionsEffect(
      caseId,
      rows.map(({ proposal }) => proposal.patch)
    );

    const users = yield* loadActorUsersEffect(
      rows.flatMap(({ proposal }) =>
        [proposal.createdBy, proposal.decidedBy].filter(
          (id): id is string => typeof id === "string" && id !== ""
        )
      )
    );

    return rows.map(({ proposal, capabilityId }, i) =>
      toRecord(proposal, {
        entityNames,
        entitySlugs,
        capabilityId,
        identifierCollisions: collisionsByIndex[i] ?? [],
        users,
      })
    );
  });
}

export function getProposalForCaseEffect(
  caseId: string,
  proposalId: string
): Effect.Effect<ProposalRecord | null, DomainTag> {
  return Effect.gen(function* getProposalForCaseGen() {
    const row = yield* tryDb(() =>
      proposalsRepo.getInCase(db, caseId, proposalId)
    );
    if (!row) return null;
    const collisionsByIndex = yield* loadIdentifierCollisionsEffect(caseId, [
      row.proposal.patch,
    ]);
    const { entityNames, entitySlugs } = yield* loadEntityDisplayMapsEffect(
      entityIdsFromPatch(row.proposal.patch)
    );
    const users = yield* loadActorUsersEffect(
      [row.proposal.createdBy, row.proposal.decidedBy].filter(
        (id): id is string => typeof id === "string" && id !== ""
      )
    );
    return toRecord(row.proposal, {
      entityNames,
      entitySlugs,
      capabilityId: row.capabilityId,
      identifierCollisions: collisionsByIndex[0] ?? [],
      users,
    });
  });
}

export function acceptProposalEffect(input: {
  caseId: string;
  proposalId: string;
  actorId: string;
  confidence?: ConfidenceTier;
  sharedEvidenceIds?: string[];
  attestationText?: string;
}): Effect.Effect<ProposalRecord, DomainTag> {
  return Effect.gen(function* acceptProposalGen() {
    const shared = [...new Set(input.sharedEvidenceIds)];
    const updated = yield* transact((tx) =>
      Effect.gen(function* acceptProposalTx() {
        const pending = yield* tryDb(() =>
          proposalsRepo.lockInCase(tx, input.caseId, input.proposalId)
        );
        if (!pending) {
          return yield* new NotFoundError({ resource: "Proposal not found" });
        }
        if (pending.status !== "pending") {
          return yield* new ConflictError({
            reason: `Proposal is already ${pending.status}`,
          });
        }

        yield* assertEvidenceIdsInCaseEffect(input.caseId, shared, tx);

        const sharedInTx = [...shared];
        const attestationText = input.attestationText?.trim();
        if (attestationText !== undefined && attestationText !== "") {
          const attestation = yield* createAttestationEffect({
            caseId: input.caseId,
            text: attestationText,
            actorId: input.actorId,
            tx,
          });
          sharedInTx.push(attestation.id);
        }

        yield* applyPatchEffect({
          caseId: input.caseId,
          patch: pending.patch,
          confidence: input.confidence,
          sharedEvidenceIds: [
            ...new Set([...sharedInTx, ...(pending.evidenceIds ?? [])]),
          ],
          tx,
        });

        const accepted = yield* tryDb(() =>
          proposalsRepo.accept(tx, input.proposalId, {
            decidedBy: input.actorId,
            decidedAt: new Date(),
          })
        );

        if (!accepted) {
          return yield* new ConflictError({
            reason: "Proposal is not pending",
          });
        }
        return accepted;
      })
    );
    yield* notifyEntityChangedEffect(input.caseId);
    const users = yield* loadActorUsersEffect(
      [updated.createdBy, updated.decidedBy].filter(
        (id): id is string => typeof id === "string" && id !== ""
      )
    );
    return toRecord(updated, { users });
  });
}

export function rejectProposalEffect(input: {
  caseId: string;
  proposalId: string;
  actorId: string;
  reason?: string;
}): Effect.Effect<ProposalRecord, DomainTag> {
  return transact((tx) =>
    Effect.gen(function* rejectProposalTx() {
      const existing = yield* tryDb(() =>
        proposalsRepo.lockInCase(tx, input.caseId, input.proposalId)
      );
      if (!existing) {
        return yield* new NotFoundError({ resource: "Proposal not found" });
      }

      const rejected = yield* tryDb(() =>
        proposalsRepo.reject(tx, input.caseId, input.proposalId, {
          rejectReason: trimmedOrNull(input.reason),
          decidedBy: input.actorId,
          decidedAt: new Date(),
        })
      );

      if (!rejected) {
        return yield* new ConflictError({
          reason: `Proposal is already ${existing.status}`,
        });
      }

      yield* tryDb(() =>
        recordRejectedFingerprints({
          caseId: input.caseId,
          proposalId: rejected.id,
          patch: rejected.patch,
          tx,
        })
      );

      return toRecord(rejected, {
        users: yield* loadActorUsersEffect(
          [rejected.createdBy, rejected.decidedBy].filter(
            (id): id is string => typeof id === "string" && id !== ""
          )
        ),
      });
    })
  );
}

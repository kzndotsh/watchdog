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
import {
  normalizeUuidList,
  parseGraphUuidList,
  patchOpRelatedEntityIds,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas";

import { requireActorIdEffect } from "../actors/require-actor-id";
import {
  labelForActor,
  loadActorUsersEffect,
} from "../actors/resolve-actor-labels";
import { buildEntityDisplayMaps } from "../entities/entity-display";
import {
  assertEvidenceIdsInCaseEffect,
  createAttestationEffect,
  parseGraphEvidenceIdsEffect,
} from "../evidence/evidence";
import {
  loadIdentifierCollisionsEffect,
  type IdentifierCollision,
} from "../graph/identifier-collisions";
import { applyPatchEffect } from "../graph/patch/apply-patch";
import {
  assertCaseInOrgEffect,
  requireTrimmedGraphId,
} from "../graph/patch/guards";
import {
  notifyEntityChangedEffect,
  notifyEvidenceChangedEffect,
  notifyProposalQueueChangedEffect,
} from "../infra/events";
import { tryDb } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { recordRejectedFingerprintsEffect } from "./finding-suppress";

export interface ProposalRecord {
  id: string;
  caseId: string;
  jobId: string | null;
  capabilityId: string | null;
  playbookId: string | null;
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
  /** entityId → summary text for queue search */
  entitySummaries?: Record<string, string>;
  /** entityId → notes text for queue search */
  entityNotes?: Record<string, string>;
  /** Identifier ops whose type+value already exist on another Entity. */
  identifierCollisions?: IdentifierCollision[];
}

function entityIdsFromPatch(patch: PatchOp[]): Set<string> {
  const entityIds = new Set<string>();
  for (const op of patch) {
    for (const entityId of patchOpRelatedEntityIds(op)) {
      entityIds.add(entityId);
    }
  }
  return entityIds;
}

function loadEntityDisplayMapsEffect(
  caseId: string,
  entityIds: Iterable<string>
): Effect.Effect<
  {
    entityNames: Record<string, string>;
    entitySlugs: Record<string, string>;
    entitySummaries: Record<string, string>;
    entityNotes: Record<string, string>;
  },
  DomainTag
> {
  const ids = [...entityIds];
  if (ids.length === 0) {
    return Effect.succeed({
      entityNames: {},
      entitySlugs: {},
      entitySummaries: {},
      entityNotes: {},
    });
  }
  return tryDb(() => entitiesRepo.listNamesByIdsInCase(db, caseId, ids)).pipe(
    Effect.map((ents) => buildEntityDisplayMaps(ents))
  );
}

function normalizePatchForWire(patch: PatchOp[]): PatchOp[] {
  return patch.map((op) =>
    op.evidenceIds === undefined
      ? op
      : { ...op, evidenceIds: normalizeUuidList(op.evidenceIds) }
  );
}

function toRecord(
  row: ProposalRow,
  opts?: {
    entityNames?: Record<string, string>;
    entitySlugs?: Record<string, string>;
    entitySummaries?: Record<string, string>;
    entityNotes?: Record<string, string>;
    capabilityId?: string | null;
    playbookId?: string | null;
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
    playbookId: opts?.playbookId ?? null,
    status: row.status,
    patch: normalizePatchForWire(row.patch),
    summary: row.summary,
    suppressedCount: row.suppressedCount,
    evidenceIds: normalizeUuidList(row.evidenceIds ?? []),
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
    entitySummaries: opts?.entitySummaries ?? {},
    entityNotes: opts?.entityNotes ?? {},
    identifierCollisions: opts?.identifierCollisions ?? [],
  };
}

function enrichProposalRecordEffect(
  proposal: ProposalRow,
  linked?: {
    capabilityId: string | null;
    playbookId: string | null;
  }
): Effect.Effect<ProposalRecord, DomainTag> {
  return Effect.gen(function* enrichProposalRecordGen() {
    let capabilityId: string | null = null;
    let playbookId: string | null = null;
    if (linked) {
      capabilityId = linked.capabilityId;
      playbookId = linked.playbookId;
    } else {
      const joined = yield* tryDb(() =>
        proposalsRepo.getInCase(db, proposal.caseId, proposal.id)
      );
      capabilityId = joined?.capabilityId ?? null;
      playbookId = joined?.playbookId ?? null;
    }

    const { entityNames, entitySlugs, entitySummaries, entityNotes } =
      yield* loadEntityDisplayMapsEffect(
        proposal.caseId,
        entityIdsFromPatch(proposal.patch)
      );
    const collisionsByIndex = yield* loadIdentifierCollisionsEffect(
      proposal.caseId,
      [proposal.patch]
    );
    const users = yield* loadActorUsersEffect([
      proposal.createdBy,
      proposal.decidedBy,
    ]);
    return toRecord(proposal, {
      entityNames,
      entitySlugs,
      entitySummaries,
      entityNotes,
      capabilityId,
      playbookId,
      identifierCollisions: collisionsByIndex[0] ?? [],
      users,
    });
  });
}

export function listProposalsForCaseEffect(
  caseId: string,
  organizationId: string,
  opts?: { status?: ProposalStatus }
): Effect.Effect<ProposalRecord[], DomainTag> {
  return Effect.gen(function* listProposalsForCaseGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const rows = yield* tryDb(() =>
      proposalsRepo.listForCase(db, scopedCaseId, opts)
    );

    const entityIds = new Set<string>();
    for (const { proposal } of rows) {
      for (const id of entityIdsFromPatch(proposal.patch)) {
        entityIds.add(id);
      }
    }

    const { entityNames, entitySlugs, entitySummaries, entityNotes } =
      yield* loadEntityDisplayMapsEffect(scopedCaseId, entityIds);

    const collisionsByIndex = yield* loadIdentifierCollisionsEffect(
      scopedCaseId,
      rows.map(({ proposal }) => proposal.patch)
    );

    const users = yield* loadActorUsersEffect(
      rows.flatMap(({ proposal }) => [proposal.createdBy, proposal.decidedBy])
    );

    return rows.map(({ proposal, capabilityId, playbookId }, i) =>
      toRecord(proposal, {
        entityNames,
        entitySlugs,
        entitySummaries,
        entityNotes,
        capabilityId,
        playbookId,
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
    const scopedCaseId = yield* requireTrimmedGraphId(caseId, "Case not found");
    const normalizedProposalId = yield* requireTrimmedGraphId(
      proposalId,
      "Proposal not found"
    );
    const row = yield* tryDb(() =>
      proposalsRepo.getInCase(db, scopedCaseId, normalizedProposalId)
    );
    if (!row) return null;
    return yield* enrichProposalRecordEffect(row.proposal, {
      capabilityId: row.capabilityId,
      playbookId: row.playbookId,
    });
  });
}

export function acceptProposalEffect(input: {
  caseId: string;
  organizationId: string;
  proposalId: string;
  actorId: string;
  confidence?: ConfidenceTier;
  sharedEvidenceIds?: string[];
  attestationText?: string;
}): Effect.Effect<ProposalRecord, DomainTag> {
  return Effect.gen(function* acceptProposalGen() {
    const actorId = yield* requireActorIdEffect(input.actorId);
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const proposalId = yield* requireTrimmedGraphId(
      input.proposalId,
      "Proposal not found"
    );
    const shared = yield* parseGraphEvidenceIdsEffect(
      input.sharedEvidenceIds ?? []
    );
    const attestationText = trimmedOrUndefined(input.attestationText);
    const updated = yield* transact((tx) =>
      Effect.gen(function* acceptProposalTx() {
        const pending = yield* tryDb(() =>
          proposalsRepo.lockInCase(tx, scopedCaseId, proposalId)
        );
        if (!pending) {
          return yield* new NotFoundError({ resource: "Proposal not found" });
        }
        if (pending.status !== "pending") {
          return yield* new ConflictError({
            reason: `Proposal is already ${pending.status}`,
          });
        }

        const proposalEvidenceParsed = parseGraphUuidList(
          pending.evidenceIds ?? []
        );
        if (proposalEvidenceParsed === null) {
          return yield* new InvalidError({
            reason: "Proposal evidenceIds contains an invalid UUID",
          });
        }
        const proposalEvidence = proposalEvidenceParsed;
        for (const op of pending.patch) {
          const raw = op.evidenceIds ?? [];
          const hasNonEmpty = raw.some(
            (id) => typeof id === "string" && id.trim() !== ""
          );
          if (!hasNonEmpty) continue;
          if (parseGraphUuidList(raw) === null) {
            return yield* new InvalidError({
              reason: "Proposal patch contains an invalid evidence id",
            });
          }
        }
        const sharedInTx = [...shared];
        if (attestationText !== undefined) {
          const attestation = yield* createAttestationEffect({
            caseId: scopedCaseId,
            text: attestationText,
            actorId,
            tx,
          });
          sharedInTx.push(attestation.id);
        }

        const allShared = parseGraphUuidList([
          ...sharedInTx,
          ...proposalEvidence,
        ]);
        if (allShared === null) {
          return yield* new InvalidError({
            reason: "One or more Evidence ids are invalid",
          });
        }
        yield* assertEvidenceIdsInCaseEffect(scopedCaseId, allShared, tx);

        yield* applyPatchEffect({
          caseId: scopedCaseId,
          patch: pending.patch,
          confidence: input.confidence,
          sharedEvidenceIds: allShared,
          tx,
        });

        const accepted = yield* tryDb(() =>
          proposalsRepo.accept(tx, scopedCaseId, proposalId, {
            decidedBy: actorId,
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
    yield* notifyEntityChangedEffect(scopedCaseId);
    yield* notifyProposalQueueChangedEffect(scopedCaseId);
    if (attestationText !== undefined) {
      yield* notifyEvidenceChangedEffect(scopedCaseId);
    }
    return yield* enrichProposalRecordEffect(updated);
  });
}

export function rejectProposalEffect(input: {
  caseId: string;
  organizationId: string;
  proposalId: string;
  actorId: string;
  reason?: string;
}): Effect.Effect<ProposalRecord, DomainTag> {
  return Effect.gen(function* rejectProposalGen() {
    const actorId = yield* requireActorIdEffect(input.actorId);
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const proposalId = yield* requireTrimmedGraphId(
      input.proposalId,
      "Proposal not found"
    );
    const rejected = yield* transact((tx) =>
      Effect.gen(function* rejectProposalTx() {
        const existing = yield* tryDb(() =>
          proposalsRepo.lockInCase(tx, scopedCaseId, proposalId)
        );
        if (!existing) {
          return yield* new NotFoundError({ resource: "Proposal not found" });
        }

        const row = yield* tryDb(() =>
          proposalsRepo.reject(tx, scopedCaseId, proposalId, {
            rejectReason: trimmedOrNull(input.reason),
            decidedBy: actorId,
            decidedAt: new Date(),
          })
        );

        if (!row) {
          return yield* new ConflictError({
            reason: `Proposal is already ${existing.status}`,
          });
        }

        yield* recordRejectedFingerprintsEffect({
          caseId: scopedCaseId,
          proposalId: row.id,
          patch: row.patch,
          tx,
        });

        return row;
      })
    );
    yield* notifyProposalQueueChangedEffect(scopedCaseId);
    return yield* enrichProposalRecordEffect(rejected);
  });
}

import { Effect } from "effect";

import { proposalListRepo, proposalQueueListRepo } from "@watchdog/db";
import type {
  ProposalListRow,
  ProposalQueueListRow,
  ProposalRow,
} from "@watchdog/db";
import type { PatchOp } from "@watchdog/schemas/graph";
import { patchOpRelatedEntityIds } from "@watchdog/schemas/graph";
import { proposalList } from "@watchdog/schemas/jobs";
import type {
  CaseId,
  ConfidenceTier,
  OrganizationId,
  GraphActor,
  ListInput,
  ListPage,
  ProposalStatus,
} from "@watchdog/schemas/shared";
import {
  PAGE_LIMIT_DEFAULT,
  normalizeUuidList,
  parseGraphUuidList,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas/shared";

import { appendActivityEffect } from "../activity/append";
import { requireActorIdEffect } from "../actors/require-actor-id";
import {
  labelForActor,
  loadActorUsersEffect,
} from "../actors/resolve-actor-labels";
import {
  buildEntityDisplayMaps,
  type EntityDisplayMaps,
} from "../entities/entity-display";
import {
  assertEvidenceIdsInCaseEffect,
  createAttestationEffect,
  parseGraphEvidenceIdsEffect,
} from "../evidence/evidence";
import { setHistoryContextEffect } from "../graph/graph-activity";
import {
  loadIdentifierCollisionsEffect,
  type IdentifierCollision,
} from "../graph/identifier-collisions";
import { applyPatchEffect } from "../graph/patch/apply-patch";
import {
  assertCaseInOrgEffect,
  requireTrimmedCaseIdEffect,
  requireTrimmedGraphId,
} from "../graph/patch/guards";
import { nowDateEffect } from "../infra/clock";
import type { Db } from "../infra/db-service";
import { listByIdsEffect, listPageEffect } from "../infra/list-page";
import { transact } from "../infra/postgres-tx";
import {
  entitiesRepoFxDb,
  proposalsRepoFxDb,
  proposalsRepoFx,
} from "../infra/repos-fx";
import {
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { recordRejectedFingerprintsEffect } from "./finding-suppress";

export type ProposalRecord = {
  id: string;
  caseId: CaseId;
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
};

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
  caseId: CaseId,
  entityIds: Iterable<string>
): Effect.Effect<EntityDisplayMaps, DomainTag, Db> {
  const ids = [...entityIds];
  if (ids.length === 0) {
    return Effect.succeed({ entityNames: {}, entitySlugs: {} });
  }
  return entitiesRepoFxDb
    .listNamesByIdsInCase(caseId, ids)
    .pipe(Effect.map((ents) => buildEntityDisplayMaps(ents)));
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
    createdBy: row.createdBy ?? null,
    createdByLabel: row.createdBy ? labelForActor(row.createdBy, users) : null,
    entityNames: opts?.entityNames ?? {},
    entitySlugs: opts?.entitySlugs ?? {},
    identifierCollisions: opts?.identifierCollisions ?? [],
  };
}

function enrichProposalRecordEffect(
  proposal: ProposalRow,
  linked?: {
    capabilityId: string | null;
    playbookId: string | null;
  }
): Effect.Effect<ProposalRecord, DomainTag, Db> {
  return Effect.gen(function* enrichProposalRecordGen() {
    let capabilityId: string | null = null;
    let playbookId: string | null = null;
    if (linked) {
      capabilityId = linked.capabilityId;
      playbookId = linked.playbookId;
    } else {
      const joined = yield* proposalsRepoFxDb.getInCase(
        proposal.caseId,
        proposal.id
      );
      capabilityId = joined?.capabilityId ?? null;
      playbookId = joined?.playbookId ?? null;
    }

    const { entityNames, entitySlugs } = yield* loadEntityDisplayMapsEffect(
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
      capabilityId,
      playbookId,
      identifierCollisions: collisionsByIndex[0] ?? [],
      users,
    });
  });
}

/** Rows of the Proposal list to wire records: one read each for Entity labels, collisions and actors. */
function proposalItems(
  caseId: CaseId,
  rows: readonly ProposalListRow[]
): Effect.Effect<readonly ProposalRecord[], DomainTag, Db> {
  return Effect.gen(function* proposalItemsGen() {
    const entityIds = new Set<string>();
    for (const row of rows) {
      for (const id of entityIdsFromPatch(row.patch)) {
        entityIds.add(id);
      }
    }
    const { entityNames, entitySlugs } = yield* loadEntityDisplayMapsEffect(
      caseId,
      entityIds
    );
    const collisionsByIndex = yield* loadIdentifierCollisionsEffect(
      caseId,
      rows.map((row) => row.patch)
    );
    const users = yield* loadActorUsersEffect(
      rows.flatMap((row) => [row.createdBy, row.decidedBy])
    );
    return rows.map((row, i) =>
      toRecord(row, {
        entityNames,
        entitySlugs,
        capabilityId: row.capabilityId,
        playbookId: row.playbookId,
        identifierCollisions: collisionsByIndex[i] ?? [],
        users,
      })
    );
  });
}

/**
 * One page of the Case's Proposal list (`proposalList`, ADR-0007): the `status` filter, `q` and
 * sort, keyset paged, with `total` on the first page. Without `input` it is the first page of
 * the default view (every status, newest first).
 */
export function listProposalsForCaseEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input?: ListInput<typeof proposalList>
): Effect.Effect<ListPage<ProposalRecord>, DomainTag, Db> {
  return Effect.gen(function* listProposalsForCaseGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    return yield* listPageEffect({
      def: proposalList,
      repo: proposalListRepo,
      scope: { caseId: scopedCaseId },
      input: input ?? { caseId: scopedCaseId, limit: PAGE_LIMIT_DEFAULT },
      toItems: (rows) => proposalItems(scopedCaseId, rows),
    });
  });
}

/** What a queue row shows of a Proposal: never its patch (the Detail reads that by id). */
export type ProposalQueueItem = {
  id: string;
  status: ProposalStatus;
  summary: string | null;
  capabilityId: string | null;
  playbookId: string | null;
  createdAt: string;
  /** Patch ops by resource (`{ claim: 2 }`). */
  opCounts: Record<string, number>;
  /** Evidence ids the Proposal cites at its own level. */
  evidenceCount: number;
};

function queueItems(
  rows: readonly ProposalQueueListRow[]
): Effect.Effect<readonly ProposalQueueItem[]> {
  return Effect.succeed(
    rows.map((row) => ({
      id: row.id,
      status: row.status,
      summary: row.summary,
      capabilityId: row.capabilityId ?? null,
      playbookId: row.playbookId ?? null,
      createdAt: row.createdAt.toISOString(),
      opCounts: row.opCounts,
      evidenceCount: row.evidenceCount,
    }))
  );
}

/**
 * One page of `proposalList` for the Triage queue, the Dashboard and the Case overview (#580): the
 * same declaration, scope, filters, `q`, sort and cursor as `listProposalsForCaseEffect`
 * (`proposalQueueListRepo` shares its binding), with a queue row's columns instead of the record.
 */
export function listProposalQueueEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input: ListInput<typeof proposalList>
): Effect.Effect<ListPage<ProposalQueueItem>, DomainTag, Db> {
  return Effect.gen(function* listProposalQueueGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    return yield* listPageEffect({
      def: proposalList,
      repo: proposalQueueListRepo,
      scope: { caseId: scopedCaseId },
      input,
      toItems: queueItems,
    });
  });
}

/**
 * One Proposal of the Case, whatever its status (Triage's URL selection when the queue has not
 * loaded it). A Proposal outside the Case is `not_found`.
 */
export function getProposalEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  proposalId: string
): Effect.Effect<ProposalRecord, DomainTag, Db> {
  return Effect.gen(function* getProposalGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const [item] = yield* listByIdsEffect({
      repo: proposalListRepo,
      scope: { caseId: scopedCaseId },
      ids: [proposalId],
      toItems: (rows) => proposalItems(scopedCaseId, rows),
    });
    if (item === undefined) {
      return yield* new NotFoundError({ entity: "Proposal", id: proposalId });
    }
    return item;
  });
}

export function getProposalForCaseEffect(
  caseId: CaseId,
  proposalId: string
): Effect.Effect<ProposalRecord | null, DomainTag, Db> {
  return Effect.gen(function* getProposalForCaseGen() {
    const scopedCaseId = yield* requireTrimmedCaseIdEffect(caseId);
    const normalizedProposalId = yield* requireTrimmedGraphId(
      proposalId,
      "Proposal"
    );
    const row = yield* proposalsRepoFxDb.getInCase(
      scopedCaseId,
      normalizedProposalId
    );
    if (!row) return null;
    return yield* enrichProposalRecordEffect(row.proposal, {
      capabilityId: row.capabilityId,
      playbookId: row.playbookId,
    });
  });
}

export function acceptProposalEffect(input: {
  caseId: CaseId;
  organizationId: OrganizationId;
  proposalId: string;
  actorId: string;
  confidence?: ConfidenceTier;
  sharedEvidenceIds?: string[];
  attestationText?: string;
}): Effect.Effect<ProposalRecord, DomainTag, Db> {
  return Effect.gen(function* acceptProposalGen() {
    const actorId = yield* requireActorIdEffect(input.actorId);
    const actor: GraphActor = { actorId };
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const proposalId = yield* requireTrimmedGraphId(
      input.proposalId,
      "Proposal"
    );
    const shared = yield* parseGraphEvidenceIdsEffect(
      input.sharedEvidenceIds ?? []
    );
    const attestationText = trimmedOrUndefined(input.attestationText);
    const updated = yield* transact((tx) =>
      Effect.gen(function* acceptProposalTx() {
        yield* setHistoryContextEffect(tx, {
          ...actor,
          channel: "triage_accept",
        });
        const pending = yield* proposalsRepoFx.lockInCase(
          tx,
          scopedCaseId,
          proposalId
        );
        if (!pending) {
          return yield* new NotFoundError({
            entity: "Proposal",
            id: proposalId,
          });
        }
        if (pending.status !== "pending") {
          return yield* new ConflictError({
            reason: `Proposal is already ${pending.status}`,
          });
        }

        // Linked rows of `proposal_evidence`: real foreign keys, so each is Evidence of this Case.
        const proposalEvidence = pending.evidenceIds;
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
          actor,
          channel: "triage_accept",
          tx,
        });

        const decidedAt = yield* nowDateEffect;
        const accepted = yield* proposalsRepoFx.accept(
          tx,
          scopedCaseId,
          proposalId,
          {
            decidedBy: actorId,
            decidedAt,
          }
        );

        if (!accepted) {
          return yield* new ConflictError({
            reason: "Proposal is not pending",
          });
        }
        yield* appendActivityEffect(tx, {
          caseId: scopedCaseId,
          kind: "proposal",
          action: "accepted",
          subjectId: accepted.id,
          actorId,
          fromValue: "pending",
          toValue: "accepted",
        });
        return accepted;
      })
    );
    return yield* enrichProposalRecordEffect(updated);
  });
}

export function rejectProposalEffect(input: {
  caseId: CaseId;
  organizationId: OrganizationId;
  proposalId: string;
  actorId: string;
  reason?: string;
}): Effect.Effect<ProposalRecord, DomainTag, Db> {
  return Effect.gen(function* rejectProposalGen() {
    const actorId = yield* requireActorIdEffect(input.actorId);
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const proposalId = yield* requireTrimmedGraphId(
      input.proposalId,
      "Proposal"
    );
    const rejected = yield* transact((tx) =>
      Effect.gen(function* rejectProposalTx() {
        const existing = yield* proposalsRepoFx.lockInCase(
          tx,
          scopedCaseId,
          proposalId
        );
        if (!existing) {
          return yield* new NotFoundError({
            entity: "Proposal",
            id: proposalId,
          });
        }

        const decidedAt = yield* nowDateEffect;
        const row = yield* proposalsRepoFx.reject(
          tx,
          scopedCaseId,
          proposalId,
          {
            rejectReason: trimmedOrNull(input.reason),
            decidedBy: actorId,
            decidedAt,
          }
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

        yield* appendActivityEffect(tx, {
          caseId: scopedCaseId,
          kind: "proposal",
          action: "rejected",
          subjectId: row.id,
          actorId,
          fromValue: "pending",
          toValue: "rejected",
        });
        return row;
      })
    );
    return yield* enrichProposalRecordEffect(rejected);
  });
}

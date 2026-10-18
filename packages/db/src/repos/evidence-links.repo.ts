import { and, eq, inArray, notInArray } from "drizzle-orm";

import {
  type CaseId,
  normalizeUuidList,
  parseGraphUuidList,
} from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import {
  claimEvidence,
  edgeEvidence,
  identifierEvidence,
  jobEvidence,
  proposalEvidence,
} from "../schema/evidence-links";
import { trimCaseId, trimResourceId } from "./_scoped-ids";

function groupByParent(
  rows: { parentId: string; evidenceId: string }[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.parentId) ?? [];
    list.push(row.evidenceId);
    map.set(row.parentId, list);
  }
  return map;
}

export const evidenceLinksRepo = {
  async listForClaims(
    exec: DbExec,
    claimIds: string[]
  ): Promise<Map<string, string[]>> {
    const normalized = normalizeUuidList(claimIds);
    if (normalized.length === 0) return new Map();
    const rows = await exec
      .select({
        parentId: claimEvidence.claimId,
        evidenceId: claimEvidence.evidenceId,
      })
      .from(claimEvidence)
      .where(inArray(claimEvidence.claimId, normalized));
    return groupByParent(rows);
  },

  async listForIdentifiers(
    exec: DbExec,
    identifierIds: string[]
  ): Promise<Map<string, string[]>> {
    const normalized = normalizeUuidList(identifierIds);
    if (normalized.length === 0) return new Map();
    const rows = await exec
      .select({
        parentId: identifierEvidence.identifierId,
        evidenceId: identifierEvidence.evidenceId,
      })
      .from(identifierEvidence)
      .where(inArray(identifierEvidence.identifierId, normalized));
    return groupByParent(rows);
  },

  async listForEdges(
    exec: DbExec,
    edgeIds: string[]
  ): Promise<Map<string, string[]>> {
    const normalized = normalizeUuidList(edgeIds);
    if (normalized.length === 0) return new Map();
    const rows = await exec
      .select({
        parentId: edgeEvidence.edgeId,
        evidenceId: edgeEvidence.evidenceId,
      })
      .from(edgeEvidence)
      .where(inArray(edgeEvidence.edgeId, normalized));
    return groupByParent(rows);
  },

  async linkClaim(
    exec: DbExec,
    caseId: CaseId,
    claimId: string,
    evidenceIds: string[]
  ): Promise<boolean> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedClaimId = trimResourceId(claimId);
    const unique = parseGraphUuidList(evidenceIds);
    if (
      scopedCaseId === undefined ||
      scopedClaimId === undefined ||
      unique === null
    )
      return false;
    if (unique.length === 0) return true;
    await exec
      .insert(claimEvidence)
      .values(
        unique.map((evidenceId) => ({
          claimId: scopedClaimId,
          caseId: scopedCaseId,
          evidenceId,
        }))
      )
      .onConflictDoNothing();
    return true;
  },

  async replaceClaim(
    exec: DbExec,
    caseId: CaseId,
    claimId: string,
    evidenceIds: string[]
  ): Promise<string[] | null> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedClaimId = trimResourceId(claimId);
    const unique = parseGraphUuidList(evidenceIds);
    if (
      scopedCaseId === undefined ||
      scopedClaimId === undefined ||
      unique === null
    )
      return null;
    // Only the difference is written: the Graph history records each link change, so
    // re-saving the same set must change nothing.
    await exec
      .delete(claimEvidence)
      .where(
        and(
          eq(claimEvidence.claimId, scopedClaimId),
          unique.length === 0
            ? undefined
            : notInArray(claimEvidence.evidenceId, unique)
        )
      );
    if (unique.length > 0) {
      await exec
        .insert(claimEvidence)
        .values(
          unique.map((evidenceId) => ({
            claimId: scopedClaimId,
            caseId: scopedCaseId,
            evidenceId,
          }))
        )
        .onConflictDoNothing();
    }
    return unique;
  },

  async linkIdentifier(
    exec: DbExec,
    caseId: CaseId,
    identifierId: string,
    evidenceIds: string[]
  ): Promise<boolean> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedIdentifierId = trimResourceId(identifierId);
    const unique = parseGraphUuidList(evidenceIds);
    if (
      scopedCaseId === undefined ||
      scopedIdentifierId === undefined ||
      unique === null
    )
      return false;
    if (unique.length === 0) return true;
    await exec
      .insert(identifierEvidence)
      .values(
        unique.map((evidenceId) => ({
          identifierId: scopedIdentifierId,
          caseId: scopedCaseId,
          evidenceId,
        }))
      )
      .onConflictDoNothing();
    return true;
  },

  async replaceIdentifier(
    exec: DbExec,
    caseId: CaseId,
    identifierId: string,
    evidenceIds: string[]
  ): Promise<string[] | null> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedIdentifierId = trimResourceId(identifierId);
    const unique = parseGraphUuidList(evidenceIds);
    if (
      scopedCaseId === undefined ||
      scopedIdentifierId === undefined ||
      unique === null
    )
      return null;
    // Only the difference is written: the Graph history records each link change, so
    // re-saving the same set must change nothing.
    await exec
      .delete(identifierEvidence)
      .where(
        and(
          eq(identifierEvidence.identifierId, scopedIdentifierId),
          unique.length === 0
            ? undefined
            : notInArray(identifierEvidence.evidenceId, unique)
        )
      );
    if (unique.length > 0) {
      await exec
        .insert(identifierEvidence)
        .values(
          unique.map((evidenceId) => ({
            identifierId: scopedIdentifierId,
            caseId: scopedCaseId,
            evidenceId,
          }))
        )
        .onConflictDoNothing();
    }
    return unique;
  },

  async linkEdge(
    exec: DbExec,
    caseId: CaseId,
    edgeId: string,
    evidenceIds: string[]
  ): Promise<boolean> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedEdgeId = trimResourceId(edgeId);
    const unique = parseGraphUuidList(evidenceIds);
    if (
      scopedCaseId === undefined ||
      scopedEdgeId === undefined ||
      unique === null
    )
      return false;
    if (unique.length === 0) return true;
    await exec
      .insert(edgeEvidence)
      .values(
        unique.map((evidenceId) => ({
          edgeId: scopedEdgeId,
          caseId: scopedCaseId,
          evidenceId,
        }))
      )
      .onConflictDoNothing();
    return true;
  },

  async replaceEdge(
    exec: DbExec,
    caseId: CaseId,
    edgeId: string,
    evidenceIds: string[]
  ): Promise<string[] | null> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedEdgeId = trimResourceId(edgeId);
    const unique = parseGraphUuidList(evidenceIds);
    if (
      scopedCaseId === undefined ||
      scopedEdgeId === undefined ||
      unique === null
    )
      return null;
    // Only the difference is written: the Graph history records each link change, so
    // re-saving the same set must change nothing.
    await exec
      .delete(edgeEvidence)
      .where(
        and(
          eq(edgeEvidence.edgeId, scopedEdgeId),
          unique.length === 0
            ? undefined
            : notInArray(edgeEvidence.evidenceId, unique)
        )
      );
    if (unique.length > 0) {
      await exec
        .insert(edgeEvidence)
        .values(
          unique.map((evidenceId) => ({
            edgeId: scopedEdgeId,
            caseId: scopedCaseId,
            evidenceId,
          }))
        )
        .onConflictDoNothing();
    }
    return unique;
  },

  /**
   * Store a new Proposal's Evidence links, in citation order. Postgres refuses an id that is
   * not Evidence of `caseId` (composite foreign key). `false` on an invalid id.
   */
  async linkProposal(
    exec: DbExec,
    caseId: CaseId,
    proposalId: string,
    evidenceIds: string[]
  ): Promise<boolean> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedProposalId = trimResourceId(proposalId);
    const unique = parseGraphUuidList(evidenceIds);
    if (
      scopedCaseId === undefined ||
      scopedProposalId === undefined ||
      unique === null
    ) {
      return false;
    }
    if (unique.length === 0) return true;
    await exec.insert(proposalEvidence).values(
      unique.map((evidenceId, position) => ({
        proposalId: scopedProposalId,
        caseId: scopedCaseId,
        evidenceId,
        position,
      }))
    );
    return true;
  },

  /** Store a new Job's Evidence links, in landing order (see `linkProposal`). */
  async linkJob(
    exec: DbExec,
    caseId: CaseId,
    jobId: string,
    evidenceIds: string[]
  ): Promise<boolean> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedJobId = trimResourceId(jobId);
    const unique = parseGraphUuidList(evidenceIds);
    if (
      scopedCaseId === undefined ||
      scopedJobId === undefined ||
      unique === null
    ) {
      return false;
    }
    if (unique.length === 0) return true;
    await exec.insert(jobEvidence).values(
      unique.map((evidenceId, position) => ({
        jobId: scopedJobId,
        caseId: scopedCaseId,
        evidenceId,
        position,
      }))
    );
    return true;
  },

  /** Replace a Job's Evidence links with `evidenceIds`, in that order. `null` on an invalid id. */
  async replaceJob(
    exec: DbExec,
    caseId: CaseId,
    jobId: string,
    evidenceIds: string[]
  ): Promise<string[] | null> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedJobId = trimResourceId(jobId);
    const unique = parseGraphUuidList(evidenceIds);
    if (
      scopedCaseId === undefined ||
      scopedJobId === undefined ||
      unique === null
    ) {
      return null;
    }
    await exec.delete(jobEvidence).where(eq(jobEvidence.jobId, scopedJobId));
    if (!(await this.linkJob(exec, scopedCaseId, scopedJobId, unique))) {
      return null;
    }
    return unique;
  },
};

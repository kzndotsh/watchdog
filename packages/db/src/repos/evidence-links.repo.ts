import { eq, inArray } from "drizzle-orm";

import { normalizeUuidList, parseGraphUuidList } from "@watchdog/schemas";

import type { DbExec } from "../exec";
import {
  claimEvidence,
  edgeEvidence,
  identifierEvidence,
} from "../schema/evidence-links";
import { trimResourceId } from "./_scoped-ids";

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
    claimId: string,
    evidenceIds: string[]
  ): Promise<boolean> {
    const scopedClaimId = trimResourceId(claimId);
    const unique = parseGraphUuidList(evidenceIds);
    if (scopedClaimId === undefined || unique === null) return false;
    if (unique.length === 0) return true;
    await exec
      .insert(claimEvidence)
      .values(
        unique.map((evidenceId) => ({ claimId: scopedClaimId, evidenceId }))
      )
      .onConflictDoNothing();
    return true;
  },

  async replaceClaim(
    exec: DbExec,
    claimId: string,
    evidenceIds: string[]
  ): Promise<string[] | null> {
    const scopedClaimId = trimResourceId(claimId);
    const unique = parseGraphUuidList(evidenceIds);
    if (scopedClaimId === undefined || unique === null) return null;
    await exec
      .delete(claimEvidence)
      .where(eq(claimEvidence.claimId, scopedClaimId));
    if (unique.length > 0) {
      await exec
        .insert(claimEvidence)
        .values(
          unique.map((evidenceId) => ({ claimId: scopedClaimId, evidenceId }))
        );
    }
    return unique;
  },

  async linkIdentifier(
    exec: DbExec,
    identifierId: string,
    evidenceIds: string[]
  ): Promise<boolean> {
    const scopedIdentifierId = trimResourceId(identifierId);
    const unique = parseGraphUuidList(evidenceIds);
    if (scopedIdentifierId === undefined || unique === null) return false;
    if (unique.length === 0) return true;
    await exec
      .insert(identifierEvidence)
      .values(
        unique.map((evidenceId) => ({
          identifierId: scopedIdentifierId,
          evidenceId,
        }))
      )
      .onConflictDoNothing();
    return true;
  },

  async replaceIdentifier(
    exec: DbExec,
    identifierId: string,
    evidenceIds: string[]
  ): Promise<string[] | null> {
    const scopedIdentifierId = trimResourceId(identifierId);
    const unique = parseGraphUuidList(evidenceIds);
    if (scopedIdentifierId === undefined || unique === null) return null;
    await exec
      .delete(identifierEvidence)
      .where(eq(identifierEvidence.identifierId, scopedIdentifierId));
    if (unique.length > 0) {
      await exec.insert(identifierEvidence).values(
        unique.map((evidenceId) => ({
          identifierId: scopedIdentifierId,
          evidenceId,
        }))
      );
    }
    return unique;
  },

  async linkEdge(
    exec: DbExec,
    edgeId: string,
    evidenceIds: string[]
  ): Promise<boolean> {
    const scopedEdgeId = trimResourceId(edgeId);
    const unique = parseGraphUuidList(evidenceIds);
    if (scopedEdgeId === undefined || unique === null) return false;
    if (unique.length === 0) return true;
    await exec
      .insert(edgeEvidence)
      .values(
        unique.map((evidenceId) => ({ edgeId: scopedEdgeId, evidenceId }))
      )
      .onConflictDoNothing();
    return true;
  },

  async replaceEdge(
    exec: DbExec,
    edgeId: string,
    evidenceIds: string[]
  ): Promise<string[] | null> {
    const scopedEdgeId = trimResourceId(edgeId);
    const unique = parseGraphUuidList(evidenceIds);
    if (scopedEdgeId === undefined || unique === null) return null;
    await exec
      .delete(edgeEvidence)
      .where(eq(edgeEvidence.edgeId, scopedEdgeId));
    if (unique.length > 0) {
      await exec
        .insert(edgeEvidence)
        .values(
          unique.map((evidenceId) => ({ edgeId: scopedEdgeId, evidenceId }))
        );
    }
    return unique;
  },
};

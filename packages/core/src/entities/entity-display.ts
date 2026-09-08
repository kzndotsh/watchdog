import { db, entitiesRepo } from "@watchdog/db";
import type { PatchOp } from "@watchdog/schemas";
import {
  entityTitleMapFromRows,
  parseTrimmedCaseId,
  patchOpRelatedEntityIds,
  proposalEntityName,
} from "@watchdog/schemas";

/** entityId → display label, slug, and searchable text maps for proposal/triage chrome. */
export function buildEntityDisplayMaps(
  rows: readonly {
    id: string;
    name: string;
    slug: string;
    summary?: string | null;
    notes?: string | null;
  }[]
): {
  entityNames: Record<string, string>;
  entitySlugs: Record<string, string>;
  entitySummaries: Record<string, string>;
  entityNotes: Record<string, string>;
} {
  const entityNames: Record<string, string> = Object.fromEntries(
    entityTitleMapFromRows(rows)
  );
  const entitySlugs: Record<string, string> = {};
  const entitySummaries: Record<string, string> = {};
  const entityNotes: Record<string, string> = {};
  for (const row of rows) {
    entitySlugs[row.id] = row.slug;
    const summary = row.summary?.trim();
    if (summary !== undefined && summary !== "") {
      entitySummaries[row.id] = summary;
    }
    const notes = row.notes?.trim();
    if (notes !== undefined && notes !== "") {
      entityNotes[row.id] = notes;
    }
  }
  return { entityNames, entitySlugs, entitySummaries, entityNotes };
}

export async function loadEntityDisplayMapsForIds(
  caseId: string,
  entityIds: readonly string[]
): Promise<{
  entityNames: Record<string, string>;
  entitySlugs: Record<string, string>;
  entitySummaries: Record<string, string>;
  entityNotes: Record<string, string>;
}> {
  if (entityIds.length === 0) {
    return {
      entityNames: {},
      entitySlugs: {},
      entitySummaries: {},
      entityNotes: {},
    };
  }
  const rows = await entitiesRepo.listNamesByIdsInCase(db, caseId, [
    ...entityIds,
  ]);
  return buildEntityDisplayMaps(rows);
}

export async function loadEntityDisplayMapsForProposalPatches(
  rows: readonly { caseId: string; patch: readonly PatchOp[] }[]
): Promise<{
  entityNames: Record<string, string>;
  entitySlugs: Record<string, string>;
  entitySummaries: Record<string, string>;
  entityNotes: Record<string, string>;
}> {
  const idsByCase = new Map<string, Set<string>>();
  for (const row of rows) {
    const ids = idsByCase.get(row.caseId) ?? new Set<string>();
    for (const op of row.patch) {
      for (const entityId of patchOpRelatedEntityIds(op)) {
        ids.add(entityId);
      }
    }
    idsByCase.set(row.caseId, ids);
  }
  const combined: {
    id: string;
    name: string;
    slug: string;
    summary?: string | null;
    notes?: string | null;
  }[] = [];
  const batches = await Promise.all(
    [...idsByCase.entries()]
      .filter(([, ids]) => ids.size > 0)
      .map(([caseId, ids]) =>
        entitiesRepo.listNamesByIdsInCase(db, caseId, [...ids])
      )
  );
  for (const caseRows of batches) {
    combined.push(...caseRows);
  }
  return buildEntityDisplayMaps(combined);
}

export async function loadEntityNameMap(
  caseId: string,
  entityIds: readonly string[]
): Promise<Record<string, string>> {
  const maps = await loadEntityDisplayMapsForIds(caseId, entityIds);
  return maps.entityNames;
}

export function entityIdsFromPatches(
  patches: readonly { patch: readonly PatchOp[] }[]
): string[] {
  const ids = new Set<string>();
  for (const row of patches) {
    for (const op of row.patch) {
      for (const entityId of patchOpRelatedEntityIds(op)) {
        ids.add(entityId);
      }
    }
  }
  return [...ids];
}

export function entityIdsFromNullable(
  entityIds: readonly (string | null | undefined)[]
): string[] {
  const ids = new Set<string>();
  for (const entityId of entityIds) {
    const trimmed =
      typeof entityId === "string"
        ? (parseTrimmedCaseId(entityId) ?? undefined)
        : undefined;
    if (trimmed !== undefined) ids.add(trimmed);
  }
  return [...ids];
}

export function firstEntityNameFromPatch(
  patch: readonly PatchOp[],
  entityNames: Readonly<Record<string, string>>,
  entitySlugs?: Readonly<Record<string, string>>
): string | null {
  return proposalEntityName({
    patch: [...patch],
    entityNames,
    entitySlugs,
  });
}

export function entityNameForId(
  entityId: string | null | undefined,
  entityNames: Readonly<Record<string, string>>
): string | null {
  const scopedId =
    entityId === undefined || entityId === null
      ? undefined
      : (parseTrimmedCaseId(entityId) ?? undefined);
  if (scopedId === undefined) return null;
  const name = entityNames[scopedId]?.trim();
  return name !== undefined && name !== "" ? name : null;
}

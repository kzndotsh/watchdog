import { Effect } from "effect";

import type { PatchOp } from "@watchdog/schemas/graph";
import {
  entityTitleMapFromRows,
  patchOpRelatedEntityIds,
} from "@watchdog/schemas/graph";
import { proposalEntityName } from "@watchdog/schemas/jobs";
import { parseTrimmedUuid, type CaseId } from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { entitiesRepoFxDb } from "../infra/repos-fx";
import type { DomainTag } from "../infra/tagged-errors";

/** entityId → display label and Dossier slug, for proposal/triage chrome. */
export type EntityDisplayMaps = {
  entityNames: Record<string, string>;
  entitySlugs: Record<string, string>;
};

export function buildEntityDisplayMaps(
  rows: readonly { id: string; name: string; slug: string }[]
): EntityDisplayMaps {
  const entityNames: Record<string, string> = Object.fromEntries(
    entityTitleMapFromRows(rows)
  );
  const entitySlugs: Record<string, string> = {};
  for (const row of rows) {
    entitySlugs[row.id] = row.slug;
  }
  return { entityNames, entitySlugs };
}

export function loadEntityDisplayMapsForIdsEffect(
  caseId: CaseId,
  entityIds: readonly string[]
): Effect.Effect<EntityDisplayMaps, DomainTag, Db> {
  if (entityIds.length === 0) {
    return Effect.succeed({ entityNames: {}, entitySlugs: {} });
  }
  return entitiesRepoFxDb
    .listNamesByIdsInCase(caseId, [...entityIds])
    .pipe(Effect.map((rows) => buildEntityDisplayMaps(rows)));
}

export function loadEntityDisplayMapsForProposalPatchesEffect(
  rows: readonly { caseId: CaseId; patch: readonly PatchOp[] }[]
): Effect.Effect<EntityDisplayMaps, DomainTag, Db> {
  const idsByCase = new Map<CaseId, Set<string>>();
  for (const row of rows) {
    const ids = idsByCase.get(row.caseId) ?? new Set<string>();
    for (const op of row.patch) {
      for (const entityId of patchOpRelatedEntityIds(op)) {
        ids.add(entityId);
      }
    }
    idsByCase.set(row.caseId, ids);
  }
  const entries = [...idsByCase.entries()].filter(([, ids]) => ids.size > 0);
  if (entries.length === 0) {
    return Effect.succeed({ entityNames: {}, entitySlugs: {} });
  }
  return Effect.forEach(
    entries,
    ([caseId, ids]) =>
      entitiesRepoFxDb
        .listNamesByIdsInCase(caseId, [...ids])
        .pipe(Effect.map((caseRows) => ({ caseId, caseRows }))),
    { concurrency: "unbounded" }
  ).pipe(
    Effect.map((batches) => {
      const combined: { id: string; name: string; slug: string }[] = [];
      for (const batch of batches) {
        combined.push(...batch.caseRows);
      }
      return buildEntityDisplayMaps(combined);
    })
  );
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
        ? (parseTrimmedUuid(entityId) ?? undefined)
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
      : (parseTrimmedUuid(entityId) ?? undefined);
  if (scopedId === undefined) return null;
  const name = entityNames[scopedId]?.trim();
  return name !== undefined && name !== "" ? name : null;
}

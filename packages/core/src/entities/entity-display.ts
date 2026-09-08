import { Effect } from "effect";

import { db, entitiesRepo } from "@watchdog/db";
import type { PatchOp } from "@watchdog/schemas";
import {
  entityTitleMapFromRows,
  parseTrimmedCaseId,
  patchOpRelatedEntityIds,
  proposalEntityName,
} from "@watchdog/schemas";

import { tryDb } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";

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

export function loadEntityDisplayMapsForIdsEffect(
  caseId: string,
  entityIds: readonly string[]
): Effect.Effect<
  {
    entityNames: Record<string, string>;
    entitySlugs: Record<string, string>;
    entitySummaries: Record<string, string>;
    entityNotes: Record<string, string>;
  },
  DomainTag
> {
  if (entityIds.length === 0) {
    return Effect.succeed({
      entityNames: {},
      entitySlugs: {},
      entitySummaries: {},
      entityNotes: {},
    });
  }
  return tryDb(() =>
    entitiesRepo.listNamesByIdsInCase(db, caseId, [...entityIds])
  ).pipe(Effect.map((rows) => buildEntityDisplayMaps(rows)));
}

export function loadEntityDisplayMapsForProposalPatchesEffect(
  rows: readonly { caseId: string; patch: readonly PatchOp[] }[]
): Effect.Effect<
  {
    entityNames: Record<string, string>;
    entitySlugs: Record<string, string>;
    entitySummaries: Record<string, string>;
    entityNotes: Record<string, string>;
  },
  DomainTag
> {
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
  const entries = [...idsByCase.entries()].filter(([, ids]) => ids.size > 0);
  if (entries.length === 0) {
    return Effect.succeed({
      entityNames: {},
      entitySlugs: {},
      entitySummaries: {},
      entityNotes: {},
    });
  }
  return Effect.forEach(
    entries,
    ([caseId, ids]) =>
      tryDb(() => entitiesRepo.listNamesByIdsInCase(db, caseId, [...ids])).pipe(
        Effect.map((caseRows) => ({ caseId, caseRows }))
      ),
    { concurrency: "unbounded" }
  ).pipe(
    Effect.map((batches) => {
      const combined: {
        id: string;
        name: string;
        slug: string;
        summary?: string | null;
        notes?: string | null;
      }[] = [];
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

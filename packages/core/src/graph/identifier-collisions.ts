import { Effect } from "effect";
import type { z } from "zod";

import type { IdentifierListRow } from "@watchdog/db";
import {
  isPatchOpOf,
  normalizeIdentifierValue,
  type PatchOp,
} from "@watchdog/domain/schemas/graph";
import type { identifierCollisionSchema } from "@watchdog/domain/schemas/jobs";
import {
  entityDisplayLabel,
  parseTrimmedCaseId,
  type CaseId,
  type IdentifierType,
} from "@watchdog/domain/schemas/shared";

import type { DomainTag } from "../errors/tagged-errors";
import type { Db } from "../infra/db-service";
import { identifiersRepoFxDb } from "../infra/repos-fx";

export type IdentifierCollision = z.output<typeof identifierCollisionSchema>;

function identifierKey(type: string, value: string): string {
  return `${type}\0${value}`;
}

function identifierKeysFromPatch(
  patch: PatchOp[]
): { opId: string; entityId: string; type: IdentifierType; value: string }[] {
  const keys: {
    opId: string;
    entityId: string;
    type: IdentifierType;
    value: string;
  }[] = [];
  for (const op of patch) {
    if (!isPatchOpOf(op, "identifier")) continue;
    const { entityId, type } = op.data;
    const value = normalizeIdentifierValue(type, op.data.value);
    if (!value) continue;
    keys.push({ opId: op.id, entityId, type, value });
  }
  return keys;
}

function indexByTypeValue(
  rows: IdentifierListRow[]
): Map<string, IdentifierListRow[]> {
  const byKey = new Map<string, IdentifierListRow[]>();
  for (const row of rows) {
    const key = identifierKey(row.type, row.value);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }
  return byKey;
}

function collisionsAgainstHits(
  keys: ReturnType<typeof identifierKeysFromPatch>,
  byKey: Map<string, IdentifierListRow[]>
): IdentifierCollision[] {
  const collisions: IdentifierCollision[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const hits = byKey.get(identifierKey(key.type, key.value)) ?? [];
    for (const hit of hits) {
      if (hit.entityId === key.entityId) continue;
      const dedupe = `${key.opId}|${hit.entityId}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      collisions.push({
        opId: key.opId,
        type: key.type,
        value: key.value,
        entityId: hit.entityId,
        entityName: entityDisplayLabel({
          name: hit.entityName,
          slug: hit.entitySlug,
        }),
        entitySlug: hit.entitySlug,
      });
    }
  }
  return collisions;
}

/** Case-wide identifier collisions for Inbox patches. */
export function loadIdentifierCollisionsEffect(
  caseId: CaseId,
  patches: readonly PatchOp[][]
): Effect.Effect<IdentifierCollision[][], DomainTag, Db> {
  const scopedCaseId = parseTrimmedCaseId(caseId) ?? undefined;
  if (scopedCaseId === undefined) {
    return Effect.succeed(patches.map(() => []));
  }
  const perPatchKeys = patches.map(identifierKeysFromPatch);
  if (perPatchKeys.every((keys) => keys.length === 0)) {
    return Effect.succeed(patches.map(() => []));
  }
  const values = perPatchKeys.flatMap((keys) => keys.map((key) => key.value));
  return identifiersRepoFxDb.listWithValues(scopedCaseId, values).pipe(
    Effect.map((hits) => {
      const byKey = indexByTypeValue(hits);
      return perPatchKeys.map((keys) => collisionsAgainstHits(keys, byKey));
    })
  );
}

import { Effect } from "effect";

import { db, identifiersRepo, type IdentifierListRow } from "@watchdog/db";
import { isOneOf } from "@watchdog/policy";
import {
  IDENTIFIER_TYPES,
  normalizeIdentifierValue,
  type IdentifierType,
  type PatchOp,
} from "@watchdog/schemas";

import { tryDb } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";

export interface IdentifierCollision {
  opId: string;
  type: IdentifierType;
  value: string;
  entityId: string;
  entityName: string;
  entitySlug: string;
}

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
    if (op.resource !== "identifier") continue;
    const typeRaw = op.data.type;
    const valueRaw = op.data.value;
    const entityId = op.data.entityId;
    if (typeof typeRaw !== "string" || !isOneOf(typeRaw, IDENTIFIER_TYPES)) {
      continue;
    }
    if (typeof valueRaw !== "string" || typeof entityId !== "string") continue;
    const value = normalizeIdentifierValue(typeRaw, valueRaw);
    if (!value) continue;
    keys.push({ opId: op.id, entityId, type: typeRaw, value });
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
        entityName: hit.entityName,
        entitySlug: hit.entitySlug,
      });
    }
  }
  return collisions;
}

/** Case-wide identifier collisions for Inbox patches. */
export function loadIdentifierCollisionsEffect(
  caseId: string,
  patches: readonly PatchOp[][]
): Effect.Effect<IdentifierCollision[][], DomainTag> {
  const perPatchKeys = patches.map(identifierKeysFromPatch);
  if (perPatchKeys.every((keys) => keys.length === 0)) {
    return Effect.succeed(patches.map(() => []));
  }
  return tryDb(() => identifiersRepo.listForCase(db, caseId)).pipe(
    Effect.map((hits) => {
      const byKey = indexByTypeValue(hits);
      return perPatchKeys.map((keys) => collisionsAgainstHits(keys, byKey));
    })
  );
}

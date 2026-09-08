import type { PatchOp } from "@watchdog/schemas";
import { parseGraphUuidList } from "@watchdog/schemas";

export type AttachEvidenceResult =
  | { ok: true; patch: PatchOp[] }
  | { ok: false; error: string };

function hasNonEmptyEvidenceId(ids: Iterable<string | null | undefined>): boolean {
  for (const id of ids) {
    if (typeof id === "string" && id.trim() !== "") return true;
  }
  return false;
}

function mergeEvidenceIds(
  existing: readonly string[],
  shared: readonly string[]
): string[] | null {
  return parseGraphUuidList([...existing, ...shared]);
}

/** Merge shared evidence ids onto claim / identifier / edge ops. */
export function attachEvidenceIds(
  patch: PatchOp[],
  evidenceIds: string[]
): AttachEvidenceResult {
  const shared = parseGraphUuidList(evidenceIds);
  if (shared === null) {
    if (hasNonEmptyEvidenceId(evidenceIds)) {
      return {
        ok: false,
        error: "attachEvidenceIds contains an invalid UUID",
      };
    }
    return { ok: true, patch };
  }
  if (shared.length === 0) return { ok: true, patch };

  const merged: PatchOp[] = [];
  for (const op of patch) {
    if (
      op.resource === "claim" ||
      op.resource === "identifier" ||
      op.resource === "edge"
    ) {
      const evidenceIdsForOp = mergeEvidenceIds(op.evidenceIds ?? [], shared);
      if (evidenceIdsForOp === null) {
        return {
          ok: false,
          error: "One or more Evidence ids are invalid",
        };
      }
      merged.push({ ...op, evidenceIds: evidenceIdsForOp });
    } else {
      merged.push(op);
    }
  }
  return { ok: true, patch: merged };
}

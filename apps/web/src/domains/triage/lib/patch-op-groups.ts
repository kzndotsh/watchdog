import { patchResourceLabel, type PatchOp } from "@watchdog/schemas/graph";
import { IDENTIFIER_TYPE_LABELS } from "@watchdog/schemas/shared";

/** A group at or under this size starts open; a bigger one starts collapsed behind its count. */
export const PATCH_GROUP_OPEN_MAX = 8;

/** The ops of one Proposal that share a resource (and, for Identifiers, a type). */
export type PatchOpGroup = {
  key: string;
  label: string;
  ops: PatchOp[];
  /** Ops in the group that are invalid or on another Entity; they sort first. */
  flaggedCount: number;
  isOpenByDefault: boolean;
};

const identifierTypeLabels: Readonly<Record<string, string>> =
  IDENTIFIER_TYPE_LABELS;

function groupOf(op: PatchOp): { key: string; label: string } {
  if (op.resource === "identifier") {
    const type = op.data.type;
    const typeLabel =
      typeof type === "string" ? identifierTypeLabels[type] : undefined;
    if (typeof type === "string" && typeLabel !== undefined) {
      return { key: `identifier:${type}`, label: `${typeLabel} Identifiers` };
    }
  }
  return {
    key: op.resource,
    label: patchResourceLabel(op.resource),
  };
}

/**
 * Group a Proposal's ops so a large one reads as "Domain Identifiers (80)" instead of 80 rows.
 * Groups keep the order their first op appears in; inside a group, flagged ops come first and
 * the rest keep their order. A group opens by default when it is small or holds a flagged op.
 */
export function groupPatchOps(
  patch: readonly PatchOp[],
  flaggedOpIds: ReadonlySet<string>
): PatchOpGroup[] {
  const byKey = new Map<string, { label: string; ops: PatchOp[] }>();
  for (const op of patch) {
    const { key, label } = groupOf(op);
    const group = byKey.get(key);
    if (group === undefined) byKey.set(key, { label, ops: [op] });
    else group.ops.push(op);
  }
  return [...byKey].map(([key, { label, ops }]) => {
    const flagged = ops.filter((op) => flaggedOpIds.has(op.id));
    const rest = ops.filter((op) => !flaggedOpIds.has(op.id));
    return {
      key,
      label,
      ops: [...flagged, ...rest],
      flaggedCount: flagged.length,
      isOpenByDefault: ops.length <= PATCH_GROUP_OPEN_MAX || flagged.length > 0,
    };
  });
}

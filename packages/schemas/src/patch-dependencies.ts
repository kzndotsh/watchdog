import { type PatchOp, patchOpRelatedEntityIds } from "./patch";

/**
 * The ops of the same patch each op needs: another op whose `id` its `data` names as an Entity
 * (an Identifier, Claim or Connection on an Entity the patch creates). A patch op's `id` is the
 * row's, so applying an op without the one it names would point at a row that is not there.
 */
export function patchOpDependencies(
  patch: readonly PatchOp[]
): ReadonlyMap<string, readonly string[]> {
  const ids = new Set(patch.map((op) => op.id));
  const deps = new Map<string, string[]>();
  for (const op of patch) {
    const named = patchOpRelatedEntityIds(op);
    // Two ops may share an id (nothing in the patch schema refuses it): an id needs what any of
    // its ops names, so choosing it never applies one of them without its Entity.
    const needs = new Set(deps.get(op.id));
    for (const id of named) {
      if (id !== op.id && ids.has(id)) needs.add(id);
    }
    deps.set(op.id, [...needs]);
  }
  return deps;
}

/**
 * The chosen ops plus every op they need, transitively, in patch order: what a partial Accept
 * must apply for the chosen ones to land.
 */
export function withPatchDependencies(
  patch: readonly PatchOp[],
  chosen: Iterable<string>
): Set<string> {
  const deps = patchOpDependencies(patch);
  const out = new Set<string>();
  const queue = [...chosen];
  while (queue.length > 0) {
    const id = queue.pop();
    if (id === undefined || out.has(id) || !deps.has(id)) continue;
    out.add(id);
    queue.push(...(deps.get(id) ?? []));
  }
  return out;
}

/**
 * Ops that need the given op, transitively: what unticking it must also untick.
 */
export function patchOpDependents(
  patch: readonly PatchOp[],
  opId: string
): Set<string> {
  const deps = patchOpDependencies(patch);
  const out = new Set<string>();
  let grew = true;
  const needed = new Set([opId]);
  while (grew) {
    grew = false;
    for (const [id, needs] of deps) {
      if (needed.has(id)) continue;
      if (needs.some((n) => needed.has(n))) {
        needed.add(id);
        out.add(id);
        grew = true;
      }
    }
  }
  return out;
}

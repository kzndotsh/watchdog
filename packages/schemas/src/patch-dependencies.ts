import type { PatchOp } from "./patch";

function collectStrings(value: unknown, into: Set<string>): void {
  if (typeof value === "string") {
    into.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, into);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, into);
  }
}

/**
 * The ops of the same patch each op needs: another op whose `id` appears anywhere in its `data`
 * (an Identifier, Claim or Connection on an Entity the patch creates). A patch op's `id` is the
 * row's, so applying an op without the one it names would point at a row that is not there.
 */
export function patchOpDependencies(
  patch: readonly PatchOp[]
): ReadonlyMap<string, readonly string[]> {
  const ids = new Set(patch.map((op) => op.id));
  const deps = new Map<string, string[]>();
  for (const op of patch) {
    const named = new Set<string>();
    collectStrings(op.data, named);
    deps.set(
      op.id,
      [...named].filter((id) => id !== op.id && ids.has(id))
    );
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

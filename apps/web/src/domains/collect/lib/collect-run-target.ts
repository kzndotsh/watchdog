/** A Cap or Playbook to open Collect's Run form with (the `run` search param, `cap:<id>` or `playbook:<id>`). */
export type CollectRunTarget = {
  kind: "cap" | "playbook";
  id: string;
};

/** Parse a `run` search value; anything else is absent. */
export function parseCollectRunTarget(
  value: unknown
): CollectRunTarget | undefined {
  if (typeof value !== "string") return undefined;
  const sep = value.indexOf(":");
  if (sep === -1) return undefined;
  const kind = value.slice(0, sep);
  const id = value.slice(sep + 1).trim();
  if ((kind !== "cap" && kind !== "playbook") || id === "") return undefined;
  return { kind, id };
}

/** The `run` search value for a target: the inverse of {@link parseCollectRunTarget}. */
export function collectRunTargetValue(target: CollectRunTarget): string {
  return `${target.kind}:${target.id}`;
}

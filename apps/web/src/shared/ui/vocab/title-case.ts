/** Shared display helpers for schema vocabulary — no I/O. */

export { titleCase } from "@watchdog/schemas";

/** Exhaustive options for selects / facets from a label map. */
export function optionsFromLabels<T extends string>(
  values: readonly T[],
  labels: Record<T, string>
): { value: T; label: string }[] {
  return values.map((value) => ({ value, label: labels[value] }));
}

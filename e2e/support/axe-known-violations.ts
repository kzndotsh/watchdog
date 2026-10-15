/**
 * Known axe violations on the smoke routes. Shrink-only: an entry that no longer
 * occurs fails the smoke, so the list can only get shorter. Fix the page, then
 * delete the entry. Only serious and critical violations are checked at all.
 */
export type KnownViolation = {
  rule: string;
  route: string;
  reason: string;
};

export const knownViolations: readonly KnownViolation[] = [
  {
    rule: "color-contrast",
    route: "/cases",
    reason:
      "One element is below the AA contrast ratio (found by the first CI run, 1 node); find it, fix the token or text, then delete this entry",
  },
  {
    rule: "color-contrast",
    route: "/settings",
    reason:
      "One element is below the AA contrast ratio (found by the first CI run, 1 node); find it, fix the token or text, then delete this entry",
  },
];

export type FoundViolation = { id: string; impact?: string | null };

const BLOCKING_IMPACTS: ReadonlySet<string> = new Set(["serious", "critical"]);

export type ViolationReport = {
  /** Blocking rule ids on the route with no known entry: the smoke fails. */
  fresh: string[];
  /** Known entries for the route whose rule no longer occurs: the smoke fails. */
  stale: KnownViolation[];
};

export function partitionViolations(
  route: string,
  found: readonly FoundViolation[],
  known: readonly KnownViolation[] = knownViolations
): ViolationReport {
  const blocking = new Set(
    found
      .filter(
        (v) => typeof v.impact === "string" && BLOCKING_IMPACTS.has(v.impact)
      )
      .map((v) => v.id)
  );
  const mine = known.filter((k) => k.route === route);
  const knownRules = new Set(mine.map((k) => k.rule));
  return {
    fresh: [...blocking].filter((id) => !knownRules.has(id)).sort(),
    stale: mine.filter((k) => !blocking.has(k.rule)),
  };
}

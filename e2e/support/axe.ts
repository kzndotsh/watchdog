import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

import { partitionViolations } from "./axe-known-violations";

/**
 * Scan the loaded page and fail on a serious or critical violation that is not in
 * `knownViolations`, or on a known entry that no longer occurs (shrink-only).
 */
export async function expectNoNewA11yViolations(
  page: Page,
  route: string
): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const { fresh, stale } = partitionViolations(route, violations);

  const detail = violations
    .filter((v) => fresh.includes(v.id))
    .map((v) => `${v.id} (${v.impact}): ${v.help} [${v.nodes.length} nodes]`);
  expect(
    detail,
    `New serious or critical axe violations on ${route}. Fix them; if they predate this check, add them to e2e/support/axe-known-violations.ts with a reason.`
  ).toEqual([]);
  expect(
    stale.map((k) => k.rule),
    `Known axe violations on ${route} that no longer occur. Delete the entries from e2e/support/axe-known-violations.ts.`
  ).toEqual([]);
}

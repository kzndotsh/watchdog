import { testId } from "@watchdog/test-kit/fixtures";

import type { ApiActor } from "../api-caller";
import type { CaseId, OrganizationId } from "../ids";
import { asCaseId, asOrganizationId } from "../ids";

/** Branded {@link testId}: a deterministic `CaseId` (`testCaseId(1)`). */
export function testCaseId(seed: number): CaseId {
  return asCaseId(testId(seed));
}

/**
 * Stamps the brand on a string WITHOUT validating it. Only for tests that feed a
 * deliberately padded or invalid id to a runtime guard that sits behind the type
 * (the guard still has to hold when the type is bypassed). Production code and
 * ordinary fixtures use `testCaseId` / `asCaseId`. Lint bans importing it outside
 * tests (`watchdog/no-untrusted-id-import`).
 */
export function untrustedCaseId(raw: string): CaseId {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the point: bypass validation to test the runtime guard
  return raw as CaseId;
}

/** Like {@link untrustedCaseId}, for `OrganizationId`. */
export function untrustedOrganizationId(raw: string): OrganizationId {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the point: bypass validation to test the runtime guard
  return raw as OrganizationId;
}

export const TEST_ORGANIZATION_ID: OrganizationId = asOrganizationId(
  testId(90)
);

/** A second organization, for cross-tenant isolation tests. */
export const TEST_OTHER_ORGANIZATION_ID: OrganizationId = asOrganizationId(
  testId(91)
);

/** Session-shaped `ApiActor` in {@link TEST_ORGANIZATION_ID}; override any field. */
export function testActor(overrides: Partial<ApiActor> = {}): ApiActor {
  return {
    userId: "u1",
    email: "a@test.local",
    name: "Agent",
    organizationId: TEST_ORGANIZATION_ID,
    ...overrides,
  };
}

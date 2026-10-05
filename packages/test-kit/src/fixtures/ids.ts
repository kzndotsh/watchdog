import {
  type ApiActor,
  type CaseId,
  type OrganizationId,
  asCaseId,
  asOrganizationId,
} from "@watchdog/schemas/shared";

/**
 * Deterministic UUID v4-shaped ids for tests.
 * `testId(1)` → `11111111-1111-4111-8111-000000000001`
 */
export function testId(seed: number): string {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xff_ff_ff_ff_ff_ff) {
    throw new Error(`testId seed out of range: ${seed}`);
  }
  const tail = seed.toString(16).padStart(12, "0");
  return `11111111-1111-4111-8111-${tail}`;
}

/** Branded {@link testId}: a deterministic `CaseId` (`testCaseId(1)`). */
export function testCaseId(seed: number): CaseId {
  return asCaseId(testId(seed));
}

export const TEST_ACTOR_ID = "test-actor";
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

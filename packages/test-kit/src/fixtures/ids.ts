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

export const TEST_ACTOR_ID = "test-actor";
export const TEST_ORGANIZATION_ID = testId(90);

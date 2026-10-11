import { beforeEach, describe, expect, it } from "vitest";

import {
  deleteCaseEffect,
  resolveActiveCaseEffect,
} from "@watchdog/core/cases";
import { runDomain } from "@watchdog/core/infra";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import { resetTestDb, seedCase, testDb } from "@watchdog/test-db";

/**
 * "First visible Case" is the first row of `listCasesEffect` (`casesRepo.list`), which is
 * ordered by name ascending. It is the same list the web server functions read through
 * oRPC before the rule moved to core. Names below are seeded out of order on purpose so
 * insertion order and name order disagree.
 */
async function seedThree(organizationId = TEST_ORGANIZATION_ID) {
  const charlie = await seedCase(testDb, {
    name: "Charlie",
    slug: "charlie-active",
    organizationId,
  });
  const alpha = await seedCase(testDb, {
    name: "Alpha",
    slug: "alpha-active",
    organizationId,
  });
  const bravo = await seedCase(testDb, {
    name: "Bravo",
    slug: "bravo-active",
    organizationId,
  });
  return { alpha, bravo, charlie };
}

/** The Active-Case rule: stored selection wins while visible, otherwise the first visible Case. */
describe("resolveActiveCaseEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("keeps a stored Case that is visible, even when it is not first", async () => {
    const { alpha, bravo, charlie } = await seedThree();

    const ctx = await runDomain(
      resolveActiveCaseEffect(TEST_ORGANIZATION_ID, charlie.id)
    );
    expect(ctx.active?.id).toBe(charlie.id);
    expect(ctx.cases.map((row) => row.id)).toEqual([
      alpha.id,
      bravo.id,
      charlie.id,
    ]);
  });

  it("heals a deleted Case to the first remaining Case by name", async () => {
    const { alpha, bravo, charlie } = await seedThree();
    const gone = await seedCase(testDb, {
      name: "Zulu",
      slug: "zulu-active",
      organizationId: TEST_ORGANIZATION_ID,
    });
    await runDomain(
      deleteCaseEffect(gone.id, { organizationId: TEST_ORGANIZATION_ID })
    );

    const ctx = await runDomain(
      resolveActiveCaseEffect(TEST_ORGANIZATION_ID, gone.id)
    );
    expect(ctx.cases.map((row) => row.id)).toEqual([
      alpha.id,
      bravo.id,
      charlie.id,
    ]);
    expect(ctx.active?.id).toBe(alpha.id);
  });

  it("heals a missing selection to the first Case by name", async () => {
    const { alpha } = await seedThree();
    const ctx = await runDomain(
      resolveActiveCaseEffect(TEST_ORGANIZATION_ID, null)
    );
    expect(ctx.active?.id).toBe(alpha.id);
  });

  it("never returns a Case from another organization as active", async () => {
    const { alpha } = await seedThree();
    const theirs = await seedCase(testDb, {
      name: "Aardvark",
      slug: "theirs-active",
      organizationId: TEST_OTHER_ORGANIZATION_ID,
    });

    const ctx = await runDomain(
      resolveActiveCaseEffect(TEST_ORGANIZATION_ID, theirs.id)
    );
    expect(ctx.active?.id).toBe(alpha.id);
    expect(ctx.cases.map((row) => row.id)).not.toContain(theirs.id);
  });

  it("has no active Case when the organization has no Cases", async () => {
    const theirs = await seedCase(testDb, {
      name: "Theirs",
      slug: "theirs-only-active",
      organizationId: TEST_OTHER_ORGANIZATION_ID,
    });
    const ctx = await runDomain(
      resolveActiveCaseEffect(TEST_ORGANIZATION_ID, theirs.id)
    );
    expect(ctx).toEqual({ cases: [], active: null });
  });
});

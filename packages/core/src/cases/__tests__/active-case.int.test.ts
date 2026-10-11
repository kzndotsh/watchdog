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

/** The Active-Case rule: stored selection wins while visible, otherwise the first visible Case. */
describe("resolveActiveCaseEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("keeps a stored Case that is visible", async () => {
    const first = await seedCase(testDb, {
      name: "First",
      slug: "first-active",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const second = await seedCase(testDb, {
      name: "Second",
      slug: "second-active",
      organizationId: TEST_ORGANIZATION_ID,
    });

    const ctx = await runDomain(
      resolveActiveCaseEffect(TEST_ORGANIZATION_ID, second.id)
    );
    expect(ctx.active?.id).toBe(second.id);
    expect(ctx.cases.map((row) => row.id)).toEqual(
      expect.arrayContaining([first.id, second.id])
    );
    expect(ctx.cases).toHaveLength(2);
  });

  it("heals a deleted Case to the first remaining Case", async () => {
    const keep = await seedCase(testDb, {
      name: "Keep",
      slug: "keep-active",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const gone = await seedCase(testDb, {
      name: "Gone",
      slug: "gone-active",
      organizationId: TEST_ORGANIZATION_ID,
    });
    await runDomain(
      deleteCaseEffect(gone.id, { organizationId: TEST_ORGANIZATION_ID })
    );

    const ctx = await runDomain(
      resolveActiveCaseEffect(TEST_ORGANIZATION_ID, gone.id)
    );
    expect(ctx.cases.map((row) => row.id)).toEqual([keep.id]);
    expect(ctx.active?.id).toBe(keep.id);
  });

  it("heals a missing selection to the first Case", async () => {
    const only = await seedCase(testDb, {
      name: "Only",
      slug: "only-active",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const ctx = await runDomain(
      resolveActiveCaseEffect(TEST_ORGANIZATION_ID, null)
    );
    expect(ctx.active?.id).toBe(only.id);
  });

  it("never returns a Case from another organization as active", async () => {
    const ours = await seedCase(testDb, {
      name: "Ours",
      slug: "ours-active",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const theirs = await seedCase(testDb, {
      name: "Theirs",
      slug: "theirs-active",
      organizationId: TEST_OTHER_ORGANIZATION_ID,
    });

    const ctx = await runDomain(
      resolveActiveCaseEffect(TEST_ORGANIZATION_ID, theirs.id)
    );
    expect(ctx.active?.id).toBe(ours.id);
    expect(ctx.cases.map((row) => row.id)).toEqual([ours.id]);
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

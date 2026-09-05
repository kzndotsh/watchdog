import { beforeEach, describe, expect, it } from "vitest";

import {
  DomainError,
  createCaseEffect,
  getCaseByIdEffect,
  listCasesEffect,
  runDomain,
} from "@watchdog/core";
import { TEST_ORGANIZATION_ID, testId } from "@watchdog/test-kit";
import { resetTestDb, seedCase, testDb } from "@watchdog/test-kit/db";

const OTHER_ORG_ID = testId(91);

describe("case organization isolation", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("does not list or fetch a case from another organization", async () => {
    const ours = await seedCase(testDb, {
      name: "Ours",
      slug: "ours-iso",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const theirs = await seedCase(testDb, {
      name: "Theirs",
      slug: "theirs-iso",
      organizationId: OTHER_ORG_ID,
    });

    const listed = await runDomain(listCasesEffect(TEST_ORGANIZATION_ID));
    expect(listed.map((row) => row.id)).toEqual([ours.id]);

    const visible = await runDomain(
      getCaseByIdEffect(ours.id, TEST_ORGANIZATION_ID)
    );
    expect(visible.id).toBe(ours.id);

    await expect(
      runDomain(getCaseByIdEffect(theirs.id, TEST_ORGANIZATION_ID))
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "not_found"
    );

    await runDomain(
      createCaseEffect({
        name: "Also ours",
        slug: "also-ours-iso",
        organizationId: TEST_ORGANIZATION_ID,
      })
    );
    const afterCreate = await runDomain(listCasesEffect(OTHER_ORG_ID));
    expect(afterCreate.map((row) => row.id)).toEqual([theirs.id]);
  });
});

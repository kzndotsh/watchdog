import { beforeEach, describe, expect, it } from "vitest";

import { listRecentActivityEffect } from "@watchdog/core/activity";
import {
  createCaseEffect,
  getCaseByIdEffect,
  listCasesEffect,
} from "@watchdog/core/cases";
import { isDomainTag } from "@watchdog/core/errors";
import { listEvidenceForCaseEffect } from "@watchdog/core/evidence";
import { listEntitiesForCaseEffect } from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import { listJobsForCaseEffect } from "@watchdog/core/jobs";
import { resetTestDb, seedCase, testDb } from "@watchdog/test-db";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/test-kit";

const OTHER_ORG_ID = TEST_OTHER_ORGANIZATION_ID;

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
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
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

  it("returns not_found for foreign-org case child lists", async () => {
    const theirs = await seedCase(testDb, {
      name: "Foreign child",
      slug: "foreign-child-iso",
      organizationId: OTHER_ORG_ID,
    });

    await expect(
      runDomain(listJobsForCaseEffect(theirs.id, TEST_ORGANIZATION_ID))
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );

    await expect(
      runDomain(listEntitiesForCaseEffect(theirs.id, TEST_ORGANIZATION_ID))
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );

    await expect(
      runDomain(listEvidenceForCaseEffect(theirs.id, TEST_ORGANIZATION_ID))
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );

    await expect(
      runDomain(
        listRecentActivityEffect({
          organizationId: TEST_ORGANIZATION_ID,
          caseId: theirs.id,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );
  });
});

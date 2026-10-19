import { Effect, Layer, Result } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { recordingBlobStore } from "@watchdog/core/blob";
import {
  createCaseEffect,
  deleteCaseEffect,
  deleteOrganizationCasesEffect,
  getCaseByIdEffect,
  getCaseBySlugEffect,
  updateCaseEffect,
} from "@watchdog/core/cases";
import {
  MAX_ECHOED_ID_CHARS,
  NotFoundError,
  isDomainTag,
} from "@watchdog/core/errors";
import { Db, runDomain, runDomainWith } from "@watchdog/core/infra";
import { db, entitiesRepo } from "@watchdog/db";
import { asCaseId } from "@watchdog/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedOrganizationMember,
  testDb,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

const runWithBlobs = runDomainWith(
  Layer.mergeAll(Db.layer, recordingBlobStore().layer)
);

async function seedOwner(organizationId = TEST_ORGANIZATION_ID) {
  await seedOrganizationMember(testDb, {
    organizationId,
    userId: TEST_ACTOR_ID,
    role: "owner",
  });
}

describe("createCase", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("allows the same slug in a different organization", async () => {
    const otherOrganizationId = TEST_OTHER_ORGANIZATION_ID;
    const first = await runDomain(
      createCaseEffect({
        name: "Alpha",
        slug: "shared-slug",
        organizationId: TEST_ORGANIZATION_ID,
      })
    );
    const second = await runDomain(
      createCaseEffect({
        name: "Alpha",
        slug: "shared-slug",
        organizationId: otherOrganizationId,
      })
    );

    expect(second.id).not.toBe(first.id);
    // Lookups stay inside the caller's organization.
    const inOther = await runDomain(
      getCaseBySlugEffect("shared-slug", otherOrganizationId)
    );
    expect(inOther.id).toBe(second.id);
  });

  it("rejects a duplicate slug", async () => {
    await runDomain(
      createCaseEffect({
        name: "Alpha",
        slug: "alpha-dup",
        organizationId: TEST_ORGANIZATION_ID,
      })
    );
    await expect(
      runDomain(
        createCaseEffect({
          name: "Beta",
          slug: "alpha-dup",
          organizationId: TEST_ORGANIZATION_ID,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "conflict"
    );
  });

  it("rejects whitespace-only case name", async () => {
    await expect(
      runDomain(
        createCaseEffect({
          name: "   ",
          slug: "blank-name",
          organizationId: TEST_ORGANIZATION_ID,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "invalid"
    );
  });

  it("rejects a name that cannot produce a slug", async () => {
    await expect(
      runDomain(
        createCaseEffect({
          name: "!!!",
          organizationId: TEST_ORGANIZATION_ID,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        isDomainTag(error) &&
        error.code === "invalid" &&
        error.message === "Name must contain letters or numbers"
    );
  });

  it("normalizes padded slug on create", async () => {
    const row = await runDomain(
      createCaseEffect({
        name: "Slug Pad",
        slug: "  slug-pad  ",
        organizationId: TEST_ORGANIZATION_ID,
      })
    );
    expect(row.slug).toBe("slug-pad");
  });
});

describe("updateCase", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("rejects a rename whose slug is taken", async () => {
    await seedCase(db, { name: "First Case", slug: "first-case" });
    const second = await seedCase(db, {
      name: "Second Case",
      slug: "second-case",
    });
    await expect(
      runDomain(
        updateCaseEffect({
          id: second.id,
          organizationId: TEST_ORGANIZATION_ID,
          name: "First Case",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "conflict"
    );
  });
});

describe("getCaseBySlug", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("accepts a padded slug", async () => {
    const cased = await seedCase(db, {
      name: "Lookup Pad",
      slug: "lookup-pad",
    });
    const row = await runDomain(
      getCaseBySlugEffect("  lookup-pad  ", TEST_ORGANIZATION_ID)
    );
    expect(row.id).toBe(cased.id);
  });

  it.each([
    ["a slug that slugifies to nothing", `  ${"!".repeat(5000)}  `],
    ["a long slug that matches no Case", "a".repeat(5000)],
  ])("echoes a bounded id for %s", async (_name, slug) => {
    const failure: unknown = await runDomain(
      getCaseBySlugEffect(slug, TEST_ORGANIZATION_ID)
    ).then(
      () => undefined,
      (error: unknown) => error
    );
    if (!(failure instanceof NotFoundError)) {
      expect.unreachable("expected NotFoundError");
    }
    expect(failure).toMatchObject({ code: "not_found", entity: "Case" });
    expect(failure.id.length).toBeLessThanOrEqual(MAX_ECHOED_ID_CHARS);
    expect(failure.id).toBe(failure.id.trim());
  });
});

describe("deleteCase", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("tombstones the case: it is gone for readers and its Graph stays until purge", async () => {
    await seedOwner();
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    await runDomain(
      deleteCaseEffect(cased.id, {
        organizationId: TEST_ORGANIZATION_ID,
        actorId: TEST_ACTOR_ID,
      })
    );
    const missing = await runDomain(
      Effect.result(getCaseByIdEffect(cased.id, TEST_ORGANIZATION_ID))
    );
    expect(Result.isFailure(missing)).toBe(true);
    expect(await entitiesRepo.getById(db, entity.id)).not.toBeNull();
  });
});

describe("deleteOrganizationCases", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("removes every Case in the organization and leaves other organizations alone", async () => {
    const otherOrganizationId = TEST_OTHER_ORGANIZATION_ID;
    await runDomain(
      createCaseEffect({
        name: "One",
        slug: "one",
        organizationId: TEST_ORGANIZATION_ID,
      })
    );
    await runDomain(
      createCaseEffect({
        name: "Two",
        slug: "two",
        organizationId: TEST_ORGANIZATION_ID,
      })
    );
    const survivor = await runDomain(
      createCaseEffect({
        name: "Elsewhere",
        slug: "elsewhere",
        organizationId: otherOrganizationId,
      })
    );

    const removed = await runWithBlobs(
      deleteOrganizationCasesEffect(TEST_ORGANIZATION_ID)
    );

    expect(removed).toBe(2);
    await expect(
      runDomain(getCaseBySlugEffect("one", TEST_ORGANIZATION_ID))
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );
    const kept = await runDomain(
      getCaseByIdEffect(asCaseId(survivor.id), otherOrganizationId)
    );
    expect(kept.slug).toBe("elsewhere");
  });
});

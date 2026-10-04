import { Effect, Result } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createCaseEffect,
  deleteCaseEffect,
  deleteOrganizationCasesEffect,
  getCaseByIdEffect,
  getCaseBySlugEffect,
  updateCaseEffect,
} from "@watchdog/core/cases";
import { DomainError } from "@watchdog/core/errors";
import { runDomain } from "@watchdog/core/infra";
import { db, entitiesRepo } from "@watchdog/db";
import { resetTestDb, seedCase, seedEntity } from "@watchdog/test-db";
import { TEST_ORGANIZATION_ID, testId } from "@watchdog/test-kit";

describe("createCase", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("allows the same slug in a different organization", async () => {
    const otherOrganizationId = testId(91);
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
      (error: unknown) => DomainError.is(error) && error.code === "conflict"
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
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
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
        DomainError.is(error) &&
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
      (error: unknown) => DomainError.is(error) && error.code === "conflict"
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
});

describe("deleteCase", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("removes the case and cascaded graph rows", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    await runDomain(
      deleteCaseEffect(cased.id, { organizationId: TEST_ORGANIZATION_ID })
    );
    const missing = await Effect.runPromise(
      Effect.result(getCaseByIdEffect(cased.id, TEST_ORGANIZATION_ID))
    );
    expect(Result.isFailure(missing)).toBe(true);
    expect(await entitiesRepo.getById(db, entity.id)).toBeNull();
  });
});

describe("deleteOrganizationCases", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("removes every Case in the organization and leaves other organizations alone", async () => {
    const otherOrganizationId = testId(91);
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

    const removed = await runDomain(
      deleteOrganizationCasesEffect(TEST_ORGANIZATION_ID)
    );

    expect(removed).toBe(2);
    await expect(
      runDomain(getCaseBySlugEffect("one", TEST_ORGANIZATION_ID))
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "not_found"
    );
    const kept = await runDomain(
      getCaseByIdEffect(survivor.id, otherOrganizationId)
    );
    expect(kept.slug).toBe("elsewhere");
  });
});

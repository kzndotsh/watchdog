import { Effect, Result } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import {
  DomainError,
  createCaseEffect,
  deleteCaseEffect,
  getCaseByIdEffect,
  updateCaseEffect,
  runDomain,
} from "@watchdog/core";
import { db, entitiesRepo } from "@watchdog/db";
import { TEST_ORGANIZATION_ID, testId } from "@watchdog/test-kit";
import { resetTestDb, seedCase, seedEntity } from "@watchdog/test-kit/db";

describe("createCase", () => {
  beforeEach(async () => {
    await resetTestDb();
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

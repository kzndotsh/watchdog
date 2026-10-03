import { Effect } from "effect";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import {
  InternalError,
  NotFoundError,
  createCaseEffect,
  deleteCaseEffect,
} from "@watchdog/core";
import { casesRepo, db } from "@watchdog/db";
import { resetTestDb, seedCase } from "@watchdog/test-db";
import { TEST_ORGANIZATION_ID } from "@watchdog/test-kit";

let spy: MockInstance | undefined;

describe("failed Case writes", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    spy?.mockRestore();
    spy = undefined;
  });

  it("raises InternalError when an insert returns no row", async () => {
    spy = vi.spyOn(casesRepo, "create").mockResolvedValueOnce(undefined);

    const failure = await Effect.runPromise(
      Effect.flip(
        createCaseEffect({
          name: "Alpha",
          organizationId: TEST_ORGANIZATION_ID,
        })
      )
    );

    expect(failure).toBeInstanceOf(InternalError);
  });

  it("raises NotFoundError when a delete matches no row", async () => {
    const seeded = await seedCase(db, { name: "Alpha" });
    spy = vi.spyOn(casesRepo, "delete").mockResolvedValueOnce(false);

    const failure = await Effect.runPromise(
      Effect.flip(
        deleteCaseEffect(seeded.id, { organizationId: TEST_ORGANIZATION_ID })
      )
    );

    expect(failure).toBeInstanceOf(NotFoundError);
  });
});

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { EGRESS_CLASSES, type EgressClass } from "@watchdog/schemas/shared";
import {
  expectPostgresRefusal,
  PG_CHECK_VIOLATION,
  resetTestDb,
  seedCase,
  testDb,
} from "@watchdog/test-db";

import { casesRepo } from "../repos/cases.repo.ts";

/*
 * `cases.allowed_egress` (#496) replaced the boolean switch: a Case allows a set of egress classes.
 * A new Case allows `local` and `target`; the database refuses an element outside the vocabulary
 * and a set without `local`.
 */
describe("cases.allowed_egress", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("gives a new Case local and target", async () => {
    const cased = await seedCase(testDb);
    expect(cased.allowedEgress).toEqual(["local", "target"]);
    const [row] = await testDb.execute<{ allowed_egress: string[] }>(
      sql`select allowed_egress from cases where id = ${cased.id}`
    );
    expect(row?.allowed_egress).toEqual(["local", "target"]);
  });

  const sets: EgressClass[][] = [
    ["local"],
    ["local", "public_lookup", "model"],
    [...EGRESS_CLASSES],
  ];

  it.each(sets)("stores %j, through the repo", async (...allowedEgress) => {
    const cased = await seedCase(testDb);
    const updated = await casesRepo.update(
      testDb,
      cased.id,
      cased.organizationId,
      { allowedEgress }
    );
    expect(updated?.allowedEgress).toEqual(allowedEgress);
  });

  it("refuses a class outside the vocabulary", async () => {
    const cased = await seedCase(testDb);
    await expectPostgresRefusal(
      testDb.execute(
        sql`update cases set allowed_egress = '{local,everything}' where id = ${cased.id}`
      ),
      { code: PG_CHECK_VIOLATION, constraint: "cases_allowed_egress_classes" }
    );
  });

  it("refuses a set without local", async () => {
    const cased = await seedCase(testDb);
    await expectPostgresRefusal(
      testDb.execute(
        sql`update cases set allowed_egress = '{target}' where id = ${cased.id}`
      ),
      { code: PG_CHECK_VIOLATION, constraint: "cases_allowed_egress_local" }
    );
    await expectPostgresRefusal(
      testDb.execute(
        sql`update cases set allowed_egress = '{}' where id = ${cased.id}`
      ),
      { code: PG_CHECK_VIOLATION, constraint: "cases_allowed_egress_local" }
    );
  });
});

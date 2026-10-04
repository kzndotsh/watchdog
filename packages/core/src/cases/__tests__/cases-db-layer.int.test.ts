import { beforeEach, describe, expect, it } from "vitest";

import { listCasesEffect } from "@watchdog/core/cases";
import { runDomainWith } from "@watchdog/core/infra";
import {
  resetTestDb,
  seedCase,
  testDb,
  TestDbLayer,
  testDbLayerOf,
} from "@watchdog/test-db";
import { TEST_ORGANIZATION_ID } from "@watchdog/test-kit";

/** `listCasesEffect` is the reference migration to the `Db` service. */
describe("listCasesEffect through the Db Layer", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("reads through the test Layer", async () => {
    const ours = await seedCase(testDb, {
      name: "Layered",
      slug: "layered",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const listed = await runDomainWith(TestDbLayer)(
      listCasesEffect(TEST_ORGANIZATION_ID)
    );
    expect(listed.map((row) => row.id)).toEqual([ours.id]);
  });

  it("uses the client the Layer provides, not the module global", async () => {
    await seedCase(testDb, {
      name: "Spied",
      slug: "spied",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const touched: (string | symbol)[] = [];
    const spy = new Proxy(testDb, {
      get(target, prop, receiver) {
        touched.push(prop);
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    const listed = await runDomainWith(testDbLayerOf(spy))(
      listCasesEffect(TEST_ORGANIZATION_ID)
    );
    expect(listed).toHaveLength(1);
    expect(touched).toContain("select");
  });
});

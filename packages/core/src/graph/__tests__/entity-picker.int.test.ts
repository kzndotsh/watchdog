import { randomUUID } from "node:crypto";

import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { isDomainTag } from "@watchdog/core/errors";
import {
  listEntitiesForCaseEffect,
  listEntityPickerEffect,
  matchEntityNamesEffect,
} from "@watchdog/core/graph";
import { Db, runDomainWith } from "@watchdog/core/infra";
import { entityList } from "@watchdog/schemas/graph";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  captureStatements,
  expectNoSeqScanOn,
  resetTestDb,
  seedCase,
  seedEntity,
  testDb,
} from "@watchdog/test-db";

const run = runDomainWith(Db.layer);

async function seedCaseWithEntities() {
  const theCase = await seedCase(testDb, {
    name: "Picker",
    slug: "picker",
    organizationId: TEST_ORGANIZATION_ID,
  });
  const acme = await seedEntity(testDb, theCase.id, {
    id: randomUUID(),
    name: "Acme Corp",
    kind: "org",
    notes: "long notes ".repeat(100),
  });
  const alice = await seedEntity(testDb, theCase.id, {
    id: randomUUID(),
    name: "Alice Ng",
    kind: "person",
  });
  return { theCase, acme, alice };
}

/**
 * The picker's page (#573) is the Entity list through a slimmer select: the same rows in the same
 * order for any `q`, filter and sort, with the picker's four fields and no Connection reads.
 */
describe("listEntityPickerEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("answers the list's rows in the list's order with the picker's fields only", async () => {
    const { theCase } = await seedCaseWithEntities();
    const call = (query: Record<string, unknown>) => {
      const input = entityList.input.parse({ caseId: theCase.id, ...query });
      return run(
        Effect.all({
          full: listEntitiesForCaseEffect(
            theCase.id,
            TEST_ORGANIZATION_ID,
            input
          ),
          slim: listEntityPickerEffect(theCase.id, TEST_ORGANIZATION_ID, input),
        })
      );
    };
    for (const query of [
      {},
      { q: "acme" },
      { sort: "updated.desc", limit: 1 },
      { kind: ["person"] },
    ]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one view at a time
      const { full, slim } = await call(query);
      expect(slim.items.map((item) => item.id)).toEqual(
        full.items.map((item) => item.id)
      );
      expect(slim.nextCursor).toEqual(full.nextCursor);
      expect(slim.total).toEqual(full.total);
    }
    const { slim } = await call({});
    expect(Object.keys(slim.items[0] ?? {}).sort()).toEqual([
      "id",
      "kind",
      "name",
      "slug",
    ]);
  });

  it("reads the Case guard and one page, through indexes", async () => {
    const { theCase } = await seedCaseWithEntities();
    const { statements } = await captureStatements(() =>
      run(
        listEntityPickerEffect(
          theCase.id,
          TEST_ORGANIZATION_ID,
          entityList.input.parse({ caseId: theCase.id })
        )
      )
    );
    expect(statements).toHaveLength(2);
    await expectNoSeqScanOn(statements, "entities");
    expect(JSON.stringify(statements)).not.toContain("edges");
  });
});

describe("matchEntityNamesEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  const match = (
    caseId: Parameters<typeof matchEntityNamesEffect>[0],
    names: string[]
  ) => run(matchEntityNamesEffect(caseId, TEST_ORGANIZATION_ID, names));

  it("matches a name ignoring case and whitespace, and a name by its slug", async () => {
    const { theCase, acme, alice } = await seedCaseWithEntities();
    const rows = await match(theCase.id, [
      "  acme CORP ",
      "alice-ng",
      "Nobody Here",
    ]);
    expect(rows.map((row) => row.id).sort()).toEqual(
      [acme.id, alice.id].sort()
    );
    expect(rows.find((row) => row.id === acme.id)).toEqual({
      id: acme.id,
      kind: "org",
      name: "Acme Corp",
      slug: "acme-corp",
    });
  });

  it("answers every Entity an ambiguous name may mean, and none for an unknown one", async () => {
    const { theCase, acme } = await seedCaseWithEntities();
    const twin = await seedEntity(testDb, theCase.id, {
      id: randomUUID(),
      name: "ACME CORP",
      slug: "acme-corp-2",
    });
    const rows = await match(theCase.id, ["Acme Corp"]);
    expect(rows.map((row) => row.id).sort()).toEqual([acme.id, twin.id].sort());
    expect(await match(theCase.id, ["Nobody Here"])).toEqual([]);
  });

  it("reads wildcards literally", async () => {
    const { theCase } = await seedCaseWithEntities();
    expect(await match(theCase.id, ["%", "_", "Acme%"])).toEqual([]);
  });

  it("never reads another Case's or organization's Entities", async () => {
    const { theCase } = await seedCaseWithEntities();
    const other = await seedCase(testDb, {
      name: "Other",
      slug: "other",
      organizationId: TEST_ORGANIZATION_ID,
    });
    await seedEntity(testDb, other.id, {
      id: randomUUID(),
      name: "Acme Corp",
    });
    const rows = await match(other.id, ["Acme Corp"]);
    expect(rows).toHaveLength(1);
    expect(
      (await match(theCase.id, ["Acme Corp"])).every(
        (row) => row.id !== rows[0]?.id
      )
    ).toBe(true);
    await expect(
      run(
        matchEntityNamesEffect(theCase.id, TEST_OTHER_ORGANIZATION_ID, [
          "Acme Corp",
        ])
      )
    ).rejects.toSatisfy(
      (error) => isDomainTag(error) && error.code === "not_found"
    );
  });

  it("costs the Case guard and one read through indexes", async () => {
    const { theCase } = await seedCaseWithEntities();
    const { statements } = await captureStatements(() =>
      match(theCase.id, ["Acme Corp", "Alice Ng"])
    );
    expect(statements).toHaveLength(2);
    await expectNoSeqScanOn(statements, "entities");
  });
});

import { events, type DbExec } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit/fixtures";

import { seedCase } from "../seed/case.ts";
import { seedEntity } from "../seed/entity.ts";
import { withSystemHistoryContext } from "../system-history-context.ts";
import { at } from "./types.ts";
import type { ListConformance } from "./types.ts";

const ENTITY_A = testId(1291);
const ENTITY_B = testId(1292);
const ENTITY_DECOY = testId(1293);

type Seeded = {
  readonly n: number;
  readonly entity: "A" | "B";
  readonly when: string;
  readonly what: string;
  readonly where?: string;
  readonly minute: number;
};

/*
 * Ids rise with `n`. `when` is free text: dates sort before words under every collation, and the
 * dates differ first at a digit; "2024-01" and "2024-03" tie twice. Added minutes tie in threes
 * (10, 20) and twos (30).
 */
const ROWS: readonly Seeded[] = [
  { n: 1, entity: "A", when: "2024-03", what: "kilo met", minute: 10 },
  {
    n: 2,
    entity: "A",
    when: "2024-01",
    what: "bravo main_account",
    where: "oslo",
    minute: 20,
  },
  { n: 3, entity: "B", when: "2024-01", what: "bravo seen", minute: 10 },
  {
    n: 4,
    entity: "B",
    when: "2025",
    what: "echo 100% sure",
    where: "bergen",
    minute: 30,
  },
  {
    n: 5,
    entity: "A",
    when: "2023-12",
    what: "india example.test",
    minute: 20,
  },
  {
    n: 6,
    entity: "B",
    when: "2024-03",
    what: "golf mainXaccount",
    where: "1000 sure",
    minute: 30,
  },
  {
    n: 7,
    entity: "A",
    when: "2024-02",
    what: "hotel",
    where: "example.test",
    minute: 10,
  },
  { n: 8, entity: "B", when: "spring 2019", what: "alpha", minute: 20 },
];

function insertValues(seeded: Seeded, caseId: CaseId, entityId: string) {
  return {
    id: testId(1200 + seeded.n),
    entityId,
    caseId,
    when: seeded.when,
    what: seeded.what,
    whereText: seeded.where ?? null,
    createdAt: at(seeded.minute),
  };
}

const tagOf = (n: number) => `v${String(n).padStart(2, "0")}`;
const entityIdOf = (entity: Seeded["entity"]) =>
  entity === "A" ? ENTITY_A : ENTITY_B;

export const eventConformance: ListConformance = {
  list: "events",
  pageLimit: 3,
  rows: ROWS.map((row) => ({
    tag: tagOf(row.n),
    id: testId(1200 + row.n),
    facts: { entityId: entityIdOf(row.entity) },
  })),
  async seed(exec: DbExec) {
    const owner = await seedCase(exec, { name: "List conformance" });
    const other = await seedCase(exec, { name: "List conformance decoy" });
    await seedEntity(exec, owner.id, { id: ENTITY_A, name: "A", slug: "a" });
    await seedEntity(exec, owner.id, { id: ENTITY_B, name: "B", slug: "b" });
    await seedEntity(exec, other.id, {
      id: ENTITY_DECOY,
      name: "Decoy",
      slug: "decoy",
    });
    await withSystemHistoryContext(exec, async (tx) => {
      await tx
        .insert(events)
        .values(
          ROWS.map((seeded) =>
            insertValues(seeded, owner.id, entityIdOf(seeded.entity))
          )
        );
      // A decoy in another Case that matches every search and sits first in every order.
      await tx.insert(events).values(
        insertValues(
          {
            n: 90,
            entity: "A",
            when: "0000 spring 2024-03",
            what: "aaa bravo example.test 100% n_a",
            where: "oslo",
            minute: 50,
          },
          other.id,
          ENTITY_DECOY
        )
      );
    });
    return {
      scope: { caseId: owner.id },
      otherScope: { caseId: other.id },
      wire: { caseId: owner.id },
    };
  },
  orders: {
    "when.asc": ["v05", "v02", "v03", "v07", "v01", "v06", "v04", "v08"],
    "when.desc": ["v08", "v04", "v06", "v01", "v07", "v03", "v02", "v05"],
    "created.desc": ["v06", "v04", "v08", "v05", "v02", "v07", "v03", "v01"],
    "created.asc": ["v01", "v03", "v07", "v02", "v05", "v08", "v04", "v06"],
  },
  reference: {
    entityId: (facts, id) => id === null || facts.entityId === id,
  },
  samples: {
    entityId: [ENTITY_A, ENTITY_B, testId(1299)],
  },
  searches: [
    // what and where
    { q: "example.test", expect: ["v05", "v07"] },
    // literal `%` and `_`: as wildcards they would also find v06 ("1000 sure", "mainXaccount")
    { q: "100%", expect: ["v04"] },
    { q: "n_a", expect: ["v02"] },
    { q: "BRAVO", expect: ["v02", "v03"] },
    { q: "oslo", expect: ["v02"] },
    // when
    { q: "spring", expect: ["v08"] },
    { q: "2024-03", expect: ["v01", "v06"] },
    { q: "bravo", filters: { entityId: ENTITY_B }, expect: ["v03"] },
  ],
};

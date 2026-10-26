import { entities, type DbExec } from "@watchdog/db";
import type { CaseId, EntityKind } from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit/fixtures";

import { seedCase } from "../seed/case.ts";
import { withSystemHistoryContext } from "../system-history-context.ts";
import { at, inChoices } from "./types.ts";
import type { ListConformance } from "./types.ts";

type Seeded = {
  readonly n: number;
  readonly kind: EntityKind;
  readonly name: string;
  readonly summary?: string;
  readonly notes?: string;
  readonly minute: number;
};

/*
 * Ids rise with `n`. Names are lowercase and differ first at a letter (or are a prefix of
 * another), so their order is the same under every collation; "bravo" ties twice (e03, e09).
 * Updated minutes tie in threes (10, 20, 30).
 */
const ROWS: readonly Seeded[] = [
  { n: 1, kind: "person", name: "kilo", minute: 10 },
  {
    n: 2,
    kind: "org",
    name: "bravo works",
    summary: "main_account",
    minute: 20,
  },
  { n: 3, kind: "person", name: "bravo", notes: "100% sure", minute: 10 },
  { n: 4, kind: "infra", name: "echo host", notes: "mainXaccount", minute: 30 },
  { n: 5, kind: "org", name: "alpha", minute: 20 },
  { n: 6, kind: "person", name: "golf", summary: "1000 sure", minute: 30 },
  {
    n: 7,
    kind: "infra",
    name: "india",
    summary: "example.test site",
    minute: 10,
  },
  { n: 8, kind: "person", name: "hotel", notes: "example.test", minute: 20 },
  { n: 9, kind: "org", name: "bravo", minute: 30 },
];

function insertValues(seeded: Seeded, caseId: CaseId) {
  return {
    id: testId(500 + seeded.n),
    caseId,
    kind: seeded.kind,
    name: seeded.name,
    slug: `e${String(seeded.n)}`,
    summary: seeded.summary ?? null,
    notes: seeded.notes ?? null,
    createdAt: at(seeded.minute),
    updatedAt: at(seeded.minute),
  };
}

const tagOf = (n: number) => `e${String(n).padStart(2, "0")}`;

export const entityConformance: ListConformance = {
  list: "entities",
  pageLimit: 3,
  rows: ROWS.map((row) => ({
    tag: tagOf(row.n),
    id: testId(500 + row.n),
    facts: { kind: row.kind },
  })),
  async seed(exec: DbExec) {
    const owner = await seedCase(exec, { name: "List conformance" });
    const other = await seedCase(exec, { name: "List conformance decoy" });
    await withSystemHistoryContext(exec, async (tx) => {
      await tx
        .insert(entities)
        .values(ROWS.map((seeded) => insertValues(seeded, owner.id)));
      // A decoy in another Case that matches every search and sits first in every order.
      await tx.insert(entities).values(
        insertValues(
          {
            n: 90,
            kind: "infra",
            name: "aaa bravo example.test 100% n_a",
            minute: 50,
          },
          other.id
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
    "name.asc": ["e05", "e03", "e09", "e02", "e04", "e06", "e08", "e07", "e01"],
    "name.desc": [
      "e01",
      "e07",
      "e08",
      "e06",
      "e04",
      "e02",
      "e09",
      "e03",
      "e05",
    ],
    "updated.desc": [
      "e09",
      "e06",
      "e04",
      "e08",
      "e05",
      "e02",
      "e07",
      "e03",
      "e01",
    ],
    "updated.asc": [
      "e01",
      "e03",
      "e07",
      "e02",
      "e05",
      "e08",
      "e04",
      "e06",
      "e09",
    ],
  },
  reference: {
    kind: (facts, kinds) => inChoices(kinds, facts.kind),
  },
  samples: {
    kind: [["person"], ["org", "infra"]],
  },
  searches: [
    // summary and notes
    { q: "example.test", expect: ["e08", "e07"] },
    // literal `%` and `_`: as wildcards they would also find e06 ("1000 sure") and e04
    { q: "100%", expect: ["e03"] },
    { q: "n_a", expect: ["e02"] },
    { q: "in_ia", expect: [] },
    { q: "BRAVO", expect: ["e03", "e09", "e02"] },
    // the display label of `kind` ("Infra")
    { q: "infra", expect: ["e04", "e07"] },
    { q: "bravo", filters: { kind: ["org"] }, expect: ["e09", "e02"] },
  ],
};

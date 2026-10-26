import { edges, type DbExec } from "@watchdog/db";
import type {
  CaseId,
  ConfidenceTier,
  EdgePredicate,
} from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit/fixtures";

import { seedCase } from "../seed/case.ts";
import { seedEntity } from "../seed/entity.ts";
import { withSystemHistoryContext } from "../system-history-context.ts";
import { at, inChoices } from "./types.ts";
import type { ListConformance } from "./types.ts";

const ENTITY = {
  A: testId(1491),
  B: testId(1492),
  C: testId(1493),
  D: testId(1494),
} as const;
const DECOY_FROM = testId(1495);
const DECOY_TO = testId(1496);

type End = keyof typeof ENTITY;

type Seeded = {
  readonly n: number;
  readonly from: End;
  readonly to: End;
  readonly predicate: EdgePredicate;
  readonly confidence: ConfidenceTier;
  readonly notes?: string;
  readonly minute: number;
};

/*
 * Ids rise with `n`. Predicates differ first at a letter, so their order is the same under every
 * collation; `associate_of` and `owns` tie twice. Updated minutes tie in threes (10, 20) and
 * twos (30). Each Entity is at both ends of some Connection, so `entityId` matches either end.
 */
const ROWS: readonly Seeded[] = [
  {
    n: 1,
    from: "A",
    to: "B",
    predicate: "owns",
    confidence: "unverified",
    minute: 10,
  },
  {
    n: 2,
    from: "A",
    to: "C",
    predicate: "associate_of",
    confidence: "possible",
    notes: "main_account",
    minute: 20,
  },
  {
    n: 3,
    from: "B",
    to: "C",
    predicate: "owns",
    confidence: "confirmed",
    minute: 10,
  },
  {
    n: 4,
    from: "C",
    to: "D",
    predicate: "leads",
    confidence: "unverified",
    notes: "100% sure",
    minute: 30,
  },
  {
    n: 5,
    from: "D",
    to: "A",
    predicate: "member_of",
    confidence: "confirmed",
    notes: "example.test",
    minute: 20,
  },
  {
    n: 6,
    from: "B",
    to: "D",
    predicate: "associate_of",
    confidence: "possible",
    notes: "mainXaccount 1000",
    minute: 30,
  },
  {
    n: 7,
    from: "C",
    to: "A",
    predicate: "operates",
    confidence: "possible",
    minute: 10,
  },
  {
    n: 8,
    from: "D",
    to: "B",
    predicate: "related_to",
    confidence: "unverified",
    notes: "seen example.test",
    minute: 20,
  },
];

function insertValues(seeded: Seeded, caseId: CaseId) {
  return {
    id: testId(1400 + seeded.n),
    fromId: ENTITY[seeded.from],
    toId: ENTITY[seeded.to],
    caseId,
    predicate: seeded.predicate,
    confidence: seeded.confidence,
    notes: seeded.notes ?? null,
    createdAt: at(seeded.minute),
    updatedAt: at(seeded.minute),
  };
}

const tagOf = (n: number) => `g${String(n).padStart(2, "0")}`;

export const edgeConformance: ListConformance = {
  list: "edges",
  pageLimit: 3,
  rows: ROWS.map((row) => ({
    tag: tagOf(row.n),
    id: testId(1400 + row.n),
    facts: {
      from: ENTITY[row.from],
      to: ENTITY[row.to],
      predicate: row.predicate,
      confidence: row.confidence,
    },
  })),
  async seed(exec: DbExec) {
    const owner = await seedCase(exec, { name: "List conformance" });
    const other = await seedCase(exec, { name: "List conformance decoy" });
    for (const [name, id] of Object.entries(ENTITY)) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- four Entities, in order
      await seedEntity(exec, owner.id, {
        id,
        name,
        slug: name.toLowerCase(),
      });
    }
    await seedEntity(exec, other.id, {
      id: DECOY_FROM,
      name: "Decoy from",
      slug: "decoy-from",
    });
    await seedEntity(exec, other.id, {
      id: DECOY_TO,
      name: "Decoy to",
      slug: "decoy-to",
    });
    await withSystemHistoryContext(exec, async (tx) => {
      await tx
        .insert(edges)
        .values(ROWS.map((seeded) => insertValues(seeded, owner.id)));
      // A decoy in another Case that matches every search and sits first in every order.
      await tx.insert(edges).values({
        id: testId(1490),
        fromId: DECOY_FROM,
        toId: DECOY_TO,
        caseId: other.id,
        predicate: "associate_of",
        confidence: "confirmed",
        notes: "aaa example.test 100% n_a owns",
        createdAt: at(50),
        updatedAt: at(50),
      });
    });
    return {
      scope: { caseId: owner.id },
      otherScope: { caseId: other.id },
      wire: { caseId: owner.id },
    };
  },
  orders: {
    "predicate.asc": ["g02", "g06", "g04", "g05", "g07", "g01", "g03", "g08"],
    "predicate.desc": ["g08", "g03", "g01", "g07", "g05", "g04", "g06", "g02"],
    "updated.desc": ["g06", "g04", "g08", "g05", "g02", "g07", "g03", "g01"],
    "updated.asc": ["g01", "g03", "g07", "g02", "g05", "g08", "g04", "g06"],
  },
  reference: {
    predicate: (facts, predicates) => inChoices(predicates, facts.predicate),
    confidence: (facts, tiers) => inChoices(tiers, facts.confidence),
    entityId: (facts, id) =>
      id === null || facts.from === id || facts.to === id,
  },
  samples: {
    predicate: [["owns"], ["associate_of", "leads"]],
    confidence: [["possible"]],
    entityId: [ENTITY.A, ENTITY.D, testId(1499)],
  },
  searches: [
    { q: "example.test", expect: ["g05", "g08"] },
    // literal `%` and `_`: as wildcards they would also find g06 ("1000", "mainXaccount")
    { q: "100%", expect: ["g04"] },
    { q: "n_a", expect: ["g02"] },
    // display labels of `predicate` ("Owns") and `confidence` ("Confirmed")
    { q: "owns", expect: ["g01", "g03"] },
    { q: "confirmed", expect: ["g05", "g03"] },
    {
      q: "example.test",
      filters: { entityId: ENTITY.B },
      expect: ["g08"],
    },
  ],
};

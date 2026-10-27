import { claims, type DbExec } from "@watchdog/db";
import type {
  CaseId,
  ClaimClass,
  ConfidenceTier,
} from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit/fixtures";

import { seedCase } from "../seed/case.ts";
import { seedEntity } from "../seed/entity.ts";
import { withSystemHistoryContext } from "../system-history-context.ts";
import { at, inChoices } from "./types.ts";
import type { ListConformance } from "./types.ts";

const ENTITY_A = testId(1191);
const ENTITY_B = testId(1192);
const ENTITY_DECOY = testId(1193);

type Seeded = {
  readonly n: number;
  readonly entity: "A" | "B";
  readonly class: ClaimClass;
  readonly confidence: ConfidenceTier;
  readonly text: string;
  readonly isRetracted?: boolean;
  readonly minute: number;
};

/*
 * Ids rise with `n`. Added minutes tie in threes (10) and twos (20); c04 and c06 are retracted,
 * so the default view (the live Claims) holds six rows and every walk crosses a tie at a page
 * boundary (page size 2).
 */
const ROWS: readonly Seeded[] = [
  {
    n: 1,
    entity: "A",
    class: "observation",
    confidence: "unverified",
    text: "kilo report",
    minute: 10,
  },
  {
    n: 2,
    entity: "A",
    class: "assessment",
    confidence: "possible",
    text: "bravo main_account",
    minute: 20,
  },
  {
    n: 3,
    entity: "B",
    class: "observation",
    confidence: "confirmed",
    text: "bravo seen",
    minute: 10,
  },
  {
    n: 4,
    entity: "B",
    class: "allegation",
    confidence: "unverified",
    text: "echo 100% sure",
    isRetracted: true,
    minute: 30,
  },
  {
    n: 5,
    entity: "A",
    class: "observation",
    confidence: "confirmed",
    text: "india example.test",
    minute: 30,
  },
  {
    n: 6,
    entity: "B",
    class: "other",
    confidence: "possible",
    text: "golf",
    isRetracted: true,
    minute: 30,
  },
  {
    n: 7,
    entity: "A",
    class: "allegation",
    confidence: "possible",
    text: "hotel mainXaccount, 1000 sure",
    minute: 10,
  },
  {
    n: 8,
    entity: "B",
    class: "assessment",
    confidence: "unverified",
    text: "alpha example.test",
    minute: 20,
  },
];

function insertValues(seeded: Seeded, caseId: CaseId, entityId: string) {
  const isRetracted = seeded.isRetracted === true;
  return {
    id: testId(1100 + seeded.n),
    entityId,
    caseId,
    class: seeded.class,
    confidence: seeded.confidence,
    text: seeded.text,
    retracted: isRetracted,
    retractKind: isRetracted ? ("retracted" as const) : null,
    retractedReason: isRetracted ? "superseded" : null,
    retractedAt: isRetracted ? at(seeded.minute) : null,
    createdAt: at(seeded.minute),
  };
}

const tagOf = (n: number) => `c${String(n).padStart(2, "0")}`;
const entityIdOf = (entity: Seeded["entity"]) =>
  entity === "A" ? ENTITY_A : ENTITY_B;

export const claimConformance: ListConformance = {
  list: "claims",
  pageLimit: 2,
  rows: ROWS.map((row) => ({
    tag: tagOf(row.n),
    id: testId(1100 + row.n),
    facts: {
      entityId: entityIdOf(row.entity),
      class: row.class,
      confidence: row.confidence,
      retracted: row.isRetracted === true,
    },
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
        .insert(claims)
        .values(
          ROWS.map((seeded) =>
            insertValues(seeded, owner.id, entityIdOf(seeded.entity))
          )
        );
      // A decoy in another Case that matches every search and sits first in every order.
      await tx.insert(claims).values(
        insertValues(
          {
            n: 90,
            entity: "A",
            class: "allegation",
            confidence: "confirmed",
            text: "aaa bravo example.test 100% n_a",
            minute: 1,
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
    "created.asc": ["c01", "c03", "c07", "c02", "c08", "c05"],
    "created.desc": ["c05", "c08", "c02", "c07", "c03", "c01"],
  },
  reference: {
    retracted: (facts, isRetracted) =>
      facts.retracted === (isRetracted === true),
    class: (facts, classes) => inChoices(classes, facts.class),
    confidence: (facts, tiers) => inChoices(tiers, facts.confidence),
    entityId: (facts, id) => id === null || facts.entityId === id,
  },
  samples: {
    retracted: [true],
    class: [["observation"], ["allegation", "other"]],
    confidence: [["possible"]],
    entityId: [ENTITY_A, ENTITY_B, testId(1199)],
  },
  searches: [
    { q: "example.test", expect: ["c08", "c05"] },
    // literal `%` and `_`: as wildcards they would also find c07 ("1000 sure", "mainXaccount")
    { q: "100%", expect: [] },
    { q: "100%", filters: { retracted: true }, expect: ["c04"] },
    { q: "n_a", expect: ["c02"] },
    { q: "BRAVO", expect: ["c03", "c02"] },
    // display labels of `class` ("Allegation") and `confidence` ("Confirmed")
    { q: "allegation", expect: ["c07"] },
    { q: "confirmed", expect: ["c03", "c05"] },
    { q: "bravo", filters: { entityId: ENTITY_B }, expect: ["c03"] },
  ],
};

import { questions, type DbExec } from "@watchdog/db";
import type { CaseId, QuestionStatus } from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit/fixtures";

import { seedCase } from "../seed/case.ts";
import { seedEntity } from "../seed/entity.ts";
import { withSystemHistoryContext } from "../system-history-context.ts";
import { at, inChoices } from "./types.ts";
import type { ListConformance } from "./types.ts";

const ENTITY_A = testId(1391);
const ENTITY_B = testId(1392);
const ENTITY_DECOY = testId(1393);

type Seeded = {
  readonly n: number;
  readonly entity: "A" | "B";
  readonly status: QuestionStatus;
  readonly text: string;
  readonly resolvedNote?: string;
  readonly minute: number;
};

/* Ids rise with `n`. Added minutes tie in threes (10, 20) and twos (30). */
const ROWS: readonly Seeded[] = [
  { n: 1, entity: "A", status: "open", text: "kilo who", minute: 10 },
  {
    n: 2,
    entity: "A",
    status: "resolved",
    text: "bravo main_account",
    resolvedNote: "answered example.test",
    minute: 20,
  },
  { n: 3, entity: "B", status: "open", text: "bravo where", minute: 10 },
  {
    n: 4,
    entity: "B",
    status: "resolved",
    text: "echo 100% sure",
    resolvedNote: "done",
    minute: 30,
  },
  {
    n: 5,
    entity: "A",
    status: "open",
    text: "india example.test",
    minute: 20,
  },
  {
    n: 6,
    entity: "B",
    status: "open",
    text: "golf mainXaccount 1000 sure",
    minute: 30,
  },
  {
    n: 7,
    entity: "A",
    status: "resolved",
    text: "hotel",
    resolvedNote: "kilo",
    minute: 10,
  },
  { n: 8, entity: "B", status: "open", text: "alpha", minute: 20 },
];

function insertValues(seeded: Seeded, caseId: CaseId, entityId: string) {
  return {
    id: testId(1300 + seeded.n),
    entityId,
    caseId,
    status: seeded.status,
    text: seeded.text,
    resolvedNote: seeded.resolvedNote ?? null,
    createdAt: at(seeded.minute),
  };
}

const tagOf = (n: number) => `q${String(n).padStart(2, "0")}`;
const entityIdOf = (entity: Seeded["entity"]) =>
  entity === "A" ? ENTITY_A : ENTITY_B;

export const questionConformance: ListConformance = {
  list: "questions",
  pageLimit: 3,
  rows: ROWS.map((row) => ({
    tag: tagOf(row.n),
    id: testId(1300 + row.n),
    facts: { entityId: entityIdOf(row.entity), status: row.status },
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
        .insert(questions)
        .values(
          ROWS.map((seeded) =>
            insertValues(seeded, owner.id, entityIdOf(seeded.entity))
          )
        );
      // A decoy in another Case that matches every search and sits first in every order.
      await tx.insert(questions).values(
        insertValues(
          {
            n: 90,
            entity: "A",
            status: "resolved",
            text: "aaa bravo example.test 100% n_a",
            resolvedNote: "kilo",
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
    "created.asc": ["q01", "q03", "q07", "q02", "q05", "q08", "q04", "q06"],
    "created.desc": ["q06", "q04", "q08", "q05", "q02", "q07", "q03", "q01"],
  },
  reference: {
    status: (facts, statuses) => inChoices(statuses, facts.status),
    entityId: (facts, id) => id === null || facts.entityId === id,
  },
  samples: {
    status: [["open"], ["resolved"]],
    entityId: [ENTITY_A, ENTITY_B, testId(1399)],
  },
  searches: [
    // text and the resolution note
    { q: "example.test", expect: ["q02", "q05"] },
    { q: "kilo", expect: ["q01", "q07"] },
    // literal `%` and `_`: as wildcards they would also find q06 ("1000 sure", "mainXaccount")
    { q: "100%", expect: ["q04"] },
    { q: "n_a", expect: ["q02"] },
    { q: "BRAVO", expect: ["q03", "q02"] },
    // the display label of `status` ("Resolved")
    { q: "resolved", expect: ["q07", "q02", "q04"] },
    { q: "bravo", filters: { status: ["open"] }, expect: ["q03"] },
    { q: "bravo", filters: { entityId: ENTITY_A }, expect: ["q02"] },
  ],
};

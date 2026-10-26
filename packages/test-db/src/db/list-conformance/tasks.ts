import { tasks, type DbExec } from "@watchdog/db";
import type {
  CaseId,
  TaskPriority,
  TaskStatus,
} from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit/fixtures";

import { seedCase } from "../seed/case.ts";
import { seedEntity } from "../seed/entity.ts";
import { withSystemHistoryContext } from "../system-history-context.ts";
import { at, inChoices } from "./types.ts";
import type { ListConformance } from "./types.ts";

type Seeded = {
  readonly n: number;
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  readonly onEntity: boolean;
  readonly title: string;
  readonly description?: string;
  readonly minute: number;
  readonly position: number;
};

const ENTITY = testId(720);
const ENTITY_DECOY = testId(721);

/*
 * Ids rise with `n`. Updated minutes tie in threes (10, 20, 30), titles in twos and threes, and
 * positions in fives (0) and threes (1), so every sort value crosses ties on page boundaries.
 * Three Tasks have no priority, one no description (the search skips a NULL column).
 */
const ROWS: readonly Seeded[] = [
  {
    n: 1,
    status: "backlog",
    priority: "high",
    onEntity: true,
    title: "alpha",
    description: "lead follow-up",
    minute: 10,
    position: 0,
  },
  {
    n: 2,
    status: "done",
    priority: "low",
    onEntity: false,
    title: "bravo",
    description: "main_account",
    minute: 20,
    position: 1,
  },
  {
    n: 3,
    status: "blocked",
    priority: null,
    onEntity: true,
    title: "alpha",
    description: "100% sure",
    minute: 10,
    position: 0,
  },
  {
    n: 4,
    status: "backlog",
    priority: "medium",
    onEntity: false,
    title: "charlie",
    description: "mainXaccount",
    minute: 30,
    position: 1,
  },
  {
    n: 5,
    status: "dropped",
    priority: "high",
    onEntity: false,
    title: "bravo",
    description: "example.test",
    minute: 20,
    position: 0,
  },
  {
    n: 6,
    status: "in_progress",
    priority: null,
    onEntity: true,
    title: "delta",
    description: "1000 sure",
    minute: 30,
    position: 0,
  },
  {
    n: 7,
    status: "done",
    priority: "medium",
    onEntity: false,
    title: "alpha",
    description: "example.test site",
    minute: 10,
    position: 0,
  },
  {
    n: 8,
    status: "backlog",
    priority: "low",
    onEntity: true,
    title: "echo",
    minute: 20,
    position: 2,
  },
  {
    n: 9,
    status: "blocked",
    priority: null,
    onEntity: false,
    title: "charlie",
    description: "BRAVO again",
    minute: 30,
    position: 1,
  },
];

function insertValues(seeded: Seeded, caseId: CaseId, entityId: string | null) {
  return {
    id: testId(700 + seeded.n),
    caseId,
    entityId,
    title: seeded.title,
    description: seeded.description ?? null,
    status: seeded.status,
    priority: seeded.priority,
    position: seeded.position,
    createdAt: at(seeded.minute),
    updatedAt: at(seeded.minute),
  };
}

const tagOf = (n: number) => `t${String(n).padStart(2, "0")}`;

export const taskConformance: ListConformance = {
  list: "tasks",
  pageLimit: 3,
  rows: ROWS.map((row) => ({
    tag: tagOf(row.n),
    id: testId(700 + row.n),
    facts: {
      status: row.status,
      priority: row.priority,
      entityId: row.onEntity ? ENTITY : null,
    },
  })),
  async seed(exec: DbExec) {
    const owner = await seedCase(exec, { name: "List conformance" });
    const other = await seedCase(exec, { name: "List conformance decoy" });
    await seedEntity(exec, owner.id, { id: ENTITY, name: "A", slug: "a" });
    await seedEntity(exec, other.id, {
      id: ENTITY_DECOY,
      name: "Decoy",
      slug: "decoy",
    });
    await withSystemHistoryContext(exec, async (tx) => {
      await tx
        .insert(tasks)
        .values(
          ROWS.map((seeded) =>
            insertValues(seeded, owner.id, seeded.onEntity ? ENTITY : null)
          )
        );
      // A decoy in another Case that matches every search and filter, and sits first in most orders.
      await tx.insert(tasks).values(
        insertValues(
          {
            n: 90,
            status: "blocked",
            priority: "high",
            onEntity: true,
            title: "aaa bravo",
            description: "example.test 100% n_a sure lead",
            minute: 50,
            position: 0,
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
    "updated.desc": [
      "t09",
      "t06",
      "t04",
      "t08",
      "t05",
      "t02",
      "t07",
      "t03",
      "t01",
    ],
    "updated.asc": [
      "t01",
      "t03",
      "t07",
      "t02",
      "t05",
      "t08",
      "t04",
      "t06",
      "t09",
    ],
    "title.asc": [
      "t01",
      "t03",
      "t07",
      "t02",
      "t05",
      "t04",
      "t09",
      "t06",
      "t08",
    ],
    "title.desc": [
      "t08",
      "t06",
      "t09",
      "t04",
      "t05",
      "t02",
      "t07",
      "t03",
      "t01",
    ],
    "position.asc": [
      "t01",
      "t03",
      "t05",
      "t06",
      "t07",
      "t02",
      "t04",
      "t09",
      "t08",
    ],
    "position.desc": [
      "t08",
      "t09",
      "t04",
      "t02",
      "t07",
      "t06",
      "t05",
      "t03",
      "t01",
    ],
  },
  reference: {
    status: (facts, statuses) => inChoices(statuses, facts.status),
    priority: (facts, priorities) => inChoices(priorities, facts.priority),
    entityId: (facts, id) => id === null || facts.entityId === id,
  },
  samples: {
    status: [["done"], ["backlog", "in_progress", "blocked"]],
    priority: [["high"], ["low", "medium"]],
    entityId: [ENTITY, testId(799)],
  },
  searches: [
    // title and description
    { q: "example.test", expect: ["t05", "t07"] },
    // literal `%` and `_`: as wildcards they would also find t06 ("1000 sure") and t04
    { q: "100%", expect: ["t03"] },
    { q: "n_a", expect: ["t02"] },
    { q: "BRAVO", expect: ["t09", "t05", "t02"] },
    // the display label of `status` ("In Progress", "Blocked")
    { q: "progress", expect: ["t06"] },
    { q: "blocked", expect: ["t09", "t03"] },
    { q: "sure", filters: { status: ["blocked"] }, expect: ["t03"] },
    { q: "lead", filters: { entityId: ENTITY }, expect: ["t01"] },
  ],
};

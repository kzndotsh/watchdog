import { proposals, type DbExec } from "@watchdog/db";
import type { CaseId, ProposalStatus } from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit/fixtures";

import { seedCase } from "../seed/case.ts";
import { at, inChoices } from "./types.ts";
import type { ListConformance } from "./types.ts";

type Seeded = {
  readonly n: number;
  readonly status: ProposalStatus;
  readonly summary?: string;
  readonly rejectReason?: string;
  readonly minute: number;
};

/*
 * Ids rise with `n`. Created minutes tie in threes (10, 20, 30), so every sort value crosses
 * ties on page boundaries. Two Proposals have no summary (the search skips a NULL column).
 */
const ROWS: readonly Seeded[] = [
  { n: 1, status: "pending", summary: "alpha lead", minute: 10 },
  { n: 2, status: "accepted", summary: "main_account", minute: 20 },
  { n: 3, status: "rejected", rejectReason: "100% sure", minute: 10 },
  { n: 4, status: "pending", summary: "echo mainXaccount", minute: 30 },
  {
    n: 5,
    status: "rejected",
    summary: "golf",
    rejectReason: "example.test",
    minute: 20,
  },
  { n: 6, status: "pending", summary: "1000 sure", minute: 30 },
  { n: 7, status: "accepted", summary: "example.test site", minute: 10 },
  { n: 8, status: "pending", minute: 20 },
  {
    n: 9,
    status: "rejected",
    summary: "bravo",
    rejectReason: "BRAVO again",
    minute: 30,
  },
];

function insertValues(seeded: Seeded, caseId: CaseId) {
  return {
    id: testId(600 + seeded.n),
    caseId,
    status: seeded.status,
    patch: [],
    summary: seeded.summary ?? null,
    rejectReason: seeded.rejectReason ?? null,
    createdAt: at(seeded.minute),
    updatedAt: at(seeded.minute),
  };
}

const tagOf = (n: number) => `p${String(n).padStart(2, "0")}`;

export const proposalConformance: ListConformance = {
  list: "proposals",
  pageLimit: 3,
  rows: ROWS.map((row) => ({
    tag: tagOf(row.n),
    id: testId(600 + row.n),
    facts: { status: row.status },
  })),
  async seed(exec: DbExec) {
    const owner = await seedCase(exec, { name: "List conformance" });
    const other = await seedCase(exec, { name: "List conformance decoy" });
    await exec
      .insert(proposals)
      .values(ROWS.map((seeded) => insertValues(seeded, owner.id)));
    // A decoy in another Case that matches every search and sits first in every order.
    await exec.insert(proposals).values(
      insertValues(
        {
          n: 90,
          status: "rejected",
          summary: "aaa bravo example.test 100% n_a sure",
          minute: 50,
        },
        other.id
      )
    );
    return {
      scope: { caseId: owner.id },
      otherScope: { caseId: other.id },
      wire: { caseId: owner.id },
    };
  },
  orders: {
    "created.desc": [
      "p09",
      "p06",
      "p04",
      "p08",
      "p05",
      "p02",
      "p07",
      "p03",
      "p01",
    ],
    "created.asc": [
      "p01",
      "p03",
      "p07",
      "p02",
      "p05",
      "p08",
      "p04",
      "p06",
      "p09",
    ],
  },
  reference: {
    status: (facts, statuses) => inChoices(statuses, facts.status),
  },
  samples: {
    status: [["pending"], ["accepted", "rejected"]],
  },
  searches: [
    // summary and reject reason
    { q: "example.test", expect: ["p05", "p07"] },
    // literal `%` and `_`: as wildcards they would also find p06 ("1000 sure") and p04
    { q: "100%", expect: ["p03"] },
    { q: "n_a", expect: ["p02"] },
    { q: "BRAVO", expect: ["p09"] },
    // the display label of `status` ("Rejected")
    { q: "rejected", expect: ["p09", "p05", "p03"] },
    { q: "sure", filters: { status: ["rejected"] }, expect: ["p03"] },
  ],
};

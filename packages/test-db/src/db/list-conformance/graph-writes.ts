import { graphWrites, type DbExec } from "@watchdog/db";
import type { CaseId, ConfidenceTier } from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit/fixtures";

import { seedCase } from "../seed/case.ts";
import { at, inChoices } from "./types.ts";
import type { ListConformance } from "./types.ts";

type Seeded = {
  readonly n: number;
  readonly actor: "actor-a" | "actor-b" | "actor-c";
  readonly actorLabel: string | null;
  readonly confidence: ConfidenceTier;
  readonly summary: string | null;
  readonly minute: number;
};

/* Ids rise with `n`. Written minutes tie in threes (10, 20) and twos (30). */
const ROWS: readonly Seeded[] = [
  {
    n: 1,
    actor: "actor-a",
    actorLabel: "Agent Alpha",
    confidence: "unverified",
    summary: "kilo import",
    minute: 10,
  },
  {
    n: 2,
    actor: "actor-b",
    actorLabel: "Agent Bravo",
    confidence: "possible",
    summary: "bravo main_account",
    minute: 20,
  },
  {
    n: 3,
    actor: "actor-a",
    actorLabel: "Agent Alpha",
    confidence: "unverified",
    summary: "bravo 100% sure",
    minute: 10,
  },
  {
    n: 4,
    actor: "actor-b",
    actorLabel: "bravo bot",
    confidence: "confirmed",
    summary: null,
    minute: 30,
  },
  {
    n: 5,
    actor: "actor-a",
    actorLabel: null,
    confidence: "possible",
    summary: "india example.test",
    minute: 20,
  },
  {
    n: 6,
    actor: "actor-b",
    actorLabel: "Agent Bravo",
    confidence: "unverified",
    summary: "golf 1000 sure mainXaccount",
    minute: 30,
  },
  {
    n: 7,
    actor: "actor-a",
    actorLabel: "hotel example.test",
    confidence: "possible",
    summary: null,
    minute: 10,
  },
  {
    n: 8,
    actor: "actor-c",
    actorLabel: null,
    confidence: "unverified",
    summary: "alpha",
    minute: 20,
  },
];

const tagOf = (n: number) => `w${String(n).padStart(2, "0")}`;

function insertValues(seeded: Seeded, caseId: CaseId) {
  return {
    id: testId(1500 + seeded.n),
    caseId,
    actorId: seeded.actor,
    actorLabel: seeded.actorLabel,
    channel: "agent_write" as const,
    userOverridden: true,
    confidence: seeded.confidence,
    summary: seeded.summary,
    patch: [],
    createdAt: at(seeded.minute),
  };
}

export const graphWriteConformance: ListConformance = {
  list: "graph-writes",
  pageLimit: 3,
  rows: ROWS.map((row) => ({
    tag: tagOf(row.n),
    id: testId(1500 + row.n),
    facts: { confidence: row.confidence, actor: row.actor },
  })),
  async seed(exec: DbExec) {
    const owner = await seedCase(exec, { name: "List conformance" });
    const other = await seedCase(exec, { name: "List conformance decoy" });
    await exec
      .insert(graphWrites)
      .values(ROWS.map((seeded) => insertValues(seeded, owner.id)));
    // A decoy in another Case that matches every search and sits first in the ascending order.
    await exec.insert(graphWrites).values(
      insertValues(
        {
          n: 90,
          actor: "actor-a",
          actorLabel: "aaa bravo example.test 100% n_a",
          confidence: "confirmed",
          summary: "aaa bravo example.test 100% n_a kilo",
          minute: 1,
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
    "created.desc": ["w06", "w04", "w08", "w05", "w02", "w07", "w03", "w01"],
    "created.asc": ["w01", "w03", "w07", "w02", "w05", "w08", "w04", "w06"],
  },
  reference: {
    confidence: (facts, tiers) => inChoices(tiers, facts.confidence),
    actor: (facts, ids) =>
      !Array.isArray(ids) || ids.length === 0 || ids.includes(facts.actor),
  },
  samples: {
    confidence: [["possible"], ["unverified", "confirmed"]],
    actor: [["actor-a"], ["actor-b", "actor-c"]],
  },
  searches: [
    // the summary and the actor's label
    { q: "example.test", expect: ["w05", "w07"] },
    { q: "kilo", expect: ["w01"] },
    // literal `%` and `_`: as wildcards they would also find w06 ("1000 sure", "mainXaccount")
    { q: "100%", expect: ["w03"] },
    { q: "n_a", expect: ["w02"] },
    { q: "BRAVO", expect: ["w06", "w04", "w02", "w03"] },
    // the display label of `confidence`
    { q: "confirmed", expect: ["w04"] },
    { q: "possible", expect: ["w05", "w02", "w07"] },
    { q: "bravo", filters: { confidence: ["possible"] }, expect: ["w02"] },
    {
      q: "bravo",
      filters: { actor: ["actor-b"] },
      expect: ["w06", "w04", "w02"],
    },
  ],
};

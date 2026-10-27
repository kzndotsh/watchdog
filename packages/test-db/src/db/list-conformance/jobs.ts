import { jobs, playbookRuns, type DbExec } from "@watchdog/db";
import type { CaseId, JobStatus } from "@watchdog/schemas/shared";
import { testId, TEST_ACTOR_ID } from "@watchdog/test-kit/fixtures";

import { seedCase } from "../seed/case.ts";
import { at, inChoices } from "./types.ts";
import type { ListConformance } from "./types.ts";

const RUN_1 = testId(1411);
const RUN_2 = testId(1412);
const RUN_DECOY = testId(1413);

type Seeded = {
  readonly n: number;
  readonly capabilityId: string;
  readonly status: JobStatus;
  readonly resultSummary?: string;
  readonly error?: string;
  readonly run?: string;
  readonly createdMinute: number;
  readonly updatedMinute: number;
};

/*
 * Ids rise with `n`. Created minutes tie in threes (10), (20) and twos (30); updated minutes tie
 * in threes (40, 60) and twos (50). j02, j03 and j08 are steps of the first run, j05 and j06 of
 * the second.
 */
const ROWS: readonly Seeded[] = [
  {
    n: 1,
    capabilityId: "network.dns.lookup",
    status: "succeeded",
    resultSummary: "kilo example.test",
    createdMinute: 10,
    updatedMinute: 40,
  },
  {
    n: 2,
    capabilityId: "network.http.probe",
    status: "failed",
    error: "bravo main_account timeout",
    run: RUN_1,
    createdMinute: 20,
    updatedMinute: 40,
  },
  {
    n: 3,
    capabilityId: "network.dns.lookup",
    status: "succeeded",
    resultSummary: "bravo 100% sure",
    run: RUN_1,
    createdMinute: 10,
    updatedMinute: 50,
  },
  {
    n: 4,
    capabilityId: "evidence.harvest",
    status: "running",
    createdMinute: 30,
    updatedMinute: 60,
  },
  {
    n: 5,
    capabilityId: "network.http.probe",
    status: "queued",
    run: RUN_2,
    createdMinute: 20,
    updatedMinute: 60,
  },
  {
    n: 6,
    capabilityId: "evidence.harvest",
    status: "succeeded",
    resultSummary: "golf 1000 sure mainXaccount",
    run: RUN_2,
    createdMinute: 30,
    updatedMinute: 40,
  },
  {
    n: 7,
    capabilityId: "network.dns.lookup",
    status: "cancelled",
    error: "hotel example.test",
    createdMinute: 10,
    updatedMinute: 50,
  },
  {
    n: 8,
    capabilityId: "network.dns.lookup",
    status: "failed",
    error: "alpha",
    run: RUN_1,
    createdMinute: 20,
    updatedMinute: 60,
  },
];

const tagOf = (n: number) => `j${String(n).padStart(2, "0")}`;

function insertValues(seeded: Seeded, caseId: CaseId, run: string | undefined) {
  return {
    id: testId(1400 + seeded.n),
    caseId,
    capabilityId: seeded.capabilityId,
    input: {},
    status: seeded.status,
    actorId: TEST_ACTOR_ID,
    resultSummary: seeded.resultSummary ?? null,
    error: seeded.error ?? null,
    playbookRunId: run ?? null,
    // each step of a run takes its own slot (`jobs_playbook_run_step_fan_uq`)
    playbookStep: run === undefined ? null : seeded.n,
    createdAt: at(seeded.createdMinute),
    updatedAt: at(seeded.updatedMinute),
  };
}

export const jobConformance: ListConformance = {
  list: "jobs",
  pageLimit: 3,
  rows: ROWS.map((row) => ({
    tag: tagOf(row.n),
    id: testId(1400 + row.n),
    facts: {
      status: row.status,
      capability: row.capabilityId,
      playbookRunId: row.run ?? null,
    },
  })),
  async seed(exec: DbExec) {
    const owner = await seedCase(exec, { name: "List conformance" });
    const other = await seedCase(exec, { name: "List conformance decoy" });
    await exec.insert(playbookRuns).values([
      {
        id: RUN_1,
        caseId: owner.id,
        playbookId: "url-capture",
        seed: {},
        actorId: TEST_ACTOR_ID,
      },
      {
        id: RUN_2,
        caseId: owner.id,
        playbookId: "url-capture",
        seed: {},
        actorId: TEST_ACTOR_ID,
      },
      {
        id: RUN_DECOY,
        caseId: other.id,
        playbookId: "url-capture",
        seed: {},
        actorId: TEST_ACTOR_ID,
      },
    ]);
    await exec
      .insert(jobs)
      .values(ROWS.map((seeded) => insertValues(seeded, owner.id, seeded.run)));
    // A decoy in another Case that matches every search and sits first in the ascending orders.
    await exec.insert(jobs).values(
      insertValues(
        {
          n: 90,
          capabilityId: "network.dns.lookup",
          status: "succeeded",
          resultSummary: "aaa bravo example.test 100% n_a kilo harvest",
          error: "aaa bravo example.test 100% n_a kilo",
          createdMinute: 1,
          updatedMinute: 1,
        },
        other.id,
        undefined
      )
    );
    return {
      scope: { caseId: owner.id },
      otherScope: { caseId: other.id },
      wire: { caseId: owner.id },
    };
  },
  orders: {
    "updated.desc": ["j08", "j05", "j04", "j07", "j03", "j06", "j02", "j01"],
    "updated.asc": ["j01", "j02", "j06", "j03", "j07", "j04", "j05", "j08"],
    "created.desc": ["j06", "j04", "j08", "j05", "j02", "j07", "j03", "j01"],
    "created.asc": ["j01", "j03", "j07", "j02", "j05", "j08", "j04", "j06"],
  },
  reference: {
    status: (facts, statuses) => inChoices(statuses, facts.status),
    capability: (facts, ids) =>
      !Array.isArray(ids) || ids.length === 0 || ids.includes(facts.capability),
    playbookRunId: (facts, id) => id === null || facts.playbookRunId === id,
  },
  samples: {
    status: [["succeeded"], ["failed", "cancelled"]],
    capability: [
      ["network.dns.lookup"],
      ["evidence.harvest", "network.http.probe"],
    ],
    playbookRunId: [RUN_1, RUN_2, testId(1419)],
  },
  searches: [
    // the result summary and the error
    { q: "example.test", expect: ["j07", "j01"] },
    { q: "kilo", expect: ["j01"] },
    // literal `%` and `_`: as wildcards they would also find j06 ("1000 sure", "mainXaccount")
    { q: "100%", expect: ["j03"] },
    { q: "n_a", expect: ["j02"] },
    { q: "BRAVO", expect: ["j03", "j02"] },
    // the Cap id, `_` literal (as a wildcard it would find every `dns.l`)
    { q: "harvest", expect: ["j04", "j06"] },
    { q: "dns_l", expect: [] },
    // the display label of `status`
    { q: "succeeded", expect: ["j03", "j06", "j01"] },
    { q: "queued", expect: ["j05"] },
    { q: "bravo", filters: { status: ["succeeded"] }, expect: ["j03"] },
    { q: "bravo", filters: { playbookRunId: RUN_1 }, expect: ["j03", "j02"] },
  ],
};

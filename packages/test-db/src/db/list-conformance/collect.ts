import { inArray } from "drizzle-orm";

import { evidence, type DbExec } from "@watchdog/db";
import {
  COLLECT_FIXTURE,
  COLLECT_FIXTURE_JOBS,
  COLLECT_FIXTURE_ORDER_ACTIVITY_DESC,
  COLLECT_FIXTURE_ORDER_STARTED_ASC,
  COLLECT_FIXTURE_ORDER_STARTED_DESC,
  COLLECT_FIXTURE_ROWS,
  COLLECT_FIXTURE_RUNS,
} from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit/fixtures";

import { flushCollectQueue } from "../collect-queue.ts";
import { seedCase } from "../seed/case.ts";
import { seedCollectQueueFixture } from "../seed/collect-queue.ts";
import { seedEntity } from "../seed/entity.ts";
import { seedEvidence } from "../seed/evidence.ts";
import { inChoices } from "./types.ts";
import type { ConformanceFacts, ListConformance } from "./types.ts";

/*
 * Collect's queue (#574) on the 12-case fixture of `@watchdog/schemas/testing`, whose 22 rows,
 * states, members and orders are written out by hand there. Two Evidence rows get an Entity here,
 * so the Entity filter has rows on both sides. The default view holds 21 rows (the hidden
 * Evidence row is its own view), the page holds 5.
 */

const ENTITY = testId(730);
const ENTITY_DECOY = testId(731);
const E = COLLECT_FIXTURE.evidence;
const J = COLLECT_FIXTURE.jobs;
const R = COLLECT_FIXTURE.runs;

/** The Evidence rows the fixture attaches to ENTITY. */
const ON_ENTITY: ReadonlySet<string> = new Set([E.a, E.c]);

/** `e-plain`, `j-cap`, `r-r1`: a short name for each fixture id. */
const TAGS: ReadonlyMap<string, string> = new Map(
  Object.entries({ e: E, j: J, r: R }).flatMap(([prefix, ids]) =>
    Object.entries(ids).map(([name, id]) => [id, `${prefix}-${name}`] as const)
  )
);

function tagOf(id: string): string {
  const tag = TAGS.get(id);
  if (tag === undefined) throw new Error(`no fixture tag for ${id}`);
  return tag;
}

/** The Cap and playbook ids of a row's member Jobs, sorted: what `capability` matches. */
function capabilitiesOf(members: readonly string[]): string {
  const ids = new Set<string>();
  for (const member of members) {
    const job = COLLECT_FIXTURE_JOBS.find(
      (candidate) => candidate.id === member
    );
    if (job === undefined) throw new Error(`no fixture Job ${member}`);
    ids.add(job.capabilityId);
    const run = COLLECT_FIXTURE_RUNS.find(
      (candidate) => candidate.id === job.playbookRunId
    );
    if (run !== undefined) ids.add(run.playbookId);
  }
  return [...ids].sort().join(",");
}

function factsOf(id: string): ConformanceFacts {
  const row = COLLECT_FIXTURE_ROWS[id];
  if (row === undefined) throw new Error(`no fixture row ${id}`);
  return {
    kind: row.kind,
    state: row.state,
    hidden: row.state === "hidden",
    entityId: ON_ENTITY.has(id) ? ENTITY : null,
    capabilities: capabilitiesOf(row.members),
  };
}

const visible = (order: readonly string[]) =>
  order.flatMap((id) =>
    COLLECT_FIXTURE_ROWS[id]?.state === "hidden" ? [] : [tagOf(id)]
  );

export const collectConformance: ListConformance = {
  list: "collect",
  pageLimit: 5,
  rows: Object.keys(COLLECT_FIXTURE_ROWS).map((id) => ({
    tag: tagOf(id),
    id,
    facts: factsOf(id),
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
    await seedCollectQueueFixture(exec, owner.id);
    await exec
      .update(evidence)
      .set({ entityId: ENTITY })
      .where(inArray(evidence.id, [...ON_ENTITY]));
    // A decoy in another Case that matches the searches and is newer than every fixture row.
    await seedEvidence(exec, other.id, {
      entityId: ENTITY_DECOY,
      label: "Pasted carrier lookup fixture failure host-footprint",
      sourceUrl: "https://collect.example/e0a",
    });
    await flushCollectQueue(exec);
    return {
      scope: { caseId: owner.id },
      otherScope: { caseId: other.id },
      wire: { caseId: owner.id },
    };
  },
  orders: {
    "activity.desc": visible(COLLECT_FIXTURE_ORDER_ACTIVITY_DESC),
    "started.desc": visible(COLLECT_FIXTURE_ORDER_STARTED_DESC),
    "started.asc": visible(COLLECT_FIXTURE_ORDER_STARTED_ASC),
  },
  reference: {
    hidden: (facts, isOn) => facts.hidden === isOn,
    state: (facts, states) => inChoices(states, facts.state),
    kind: (facts, kinds) => inChoices(kinds, facts.kind),
    unprocessed: (facts, isOn) =>
      isOn !== true || facts.state === "unprocessed",
    unattached: (facts, isOn) =>
      isOn !== true || (facts.kind === "evidence" && facts.entityId === null),
    capability: (facts, ids) =>
      !Array.isArray(ids) ||
      ids.length === 0 ||
      String(facts.capabilities)
        .split(",")
        .some((id) => ids.includes(id)),
    entityId: (facts, id) => id === null || facts.entityId === id,
  },
  samples: {
    hidden: [true],
    state: [["running"], ["landed", "failed"]],
    kind: [["run"], ["evidence", "job"]],
    unprocessed: [true],
    unattached: [true],
    capability: [
      ["network.dns.lookup"],
      ["host-footprint", "evidence.harvest"],
    ],
    entityId: [ENTITY, testId(799)],
  },
  searches: [
    // the Evidence label
    { q: "carrier", expect: [tagOf(E.plain)] },
    // the Evidence URL
    { q: "example/e0a", expect: [tagOf(E.t1)] },
    // a member's error: the run row holds A1, which failed
    {
      q: "Fixture failure",
      expect: [J.p2, R.r1, J.f, J.u3].map((id) => tagOf(id)),
    },
    {
      q: "failure",
      filters: { state: ["failed"] },
      expect: [J.p2, J.f, J.u3].map((id) => tagOf(id)),
    },
    // the playbook id, humanized
    { q: "footprint", expect: [tagOf(R.r1)] },
    // the display label of `state`
    { q: "running", expect: [R.r1, J.run].map((id) => tagOf(id)) },
  ],
};

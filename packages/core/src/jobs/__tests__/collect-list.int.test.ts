import { Effect } from "effect";
import { beforeAll, describe, expect, it } from "vitest";

import { Db, runDomainWith } from "@watchdog/core/infra";
import { db, evidenceRepo } from "@watchdog/db";
import { collectList } from "@watchdog/schemas/jobs";
import type { CaseId } from "@watchdog/schemas/shared";
import {
  COLLECT_FIXTURE,
  COLLECT_FIXTURE_ORDER_ACTIVITY_DESC,
  TEST_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  captureStatements,
  resetTestDb,
  seedCase,
  seedCollectQueueFixture,
} from "@watchdog/test-db";

import { getCollectItemEffect, listCollectEffect } from "../collect-list.ts";

/*
 * Collect's list service (#574) on the 12-case fixture: a page carries each row's members and
 * Evidence from one statement, `collect.get` finds a row, a member Job or a run with no row, and
 * a walk survives rows changing between pages (the `activity` key moves).
 */

const E = COLLECT_FIXTURE.evidence;
const J = COLLECT_FIXTURE.jobs;
const R = COLLECT_FIXTURE.runs;
const run = runDomainWith(Db.layer);

let caseId: CaseId;

const listInput = (wire: Record<string, unknown> = {}) =>
  collectList.input.parse({ caseId, limit: 5, ...wire });
const page = (wire?: Record<string, unknown>) =>
  run(listCollectEffect(caseId, TEST_ORGANIZATION_ID, listInput(wire)));
const locate = (id: string, hidden?: true) =>
  run(
    getCollectItemEffect(caseId, TEST_ORGANIZATION_ID, {
      id,
      ...(hidden === undefined ? {} : { hidden }),
    })
  );

beforeAll(async () => {
  await resetTestDb();
  caseId = (await seedCase(db)).id;
  await seedCollectQueueFixture(db, caseId);
});

describe("collect.list service", () => {
  it("returns the rows with their members, Evidence and input titles from one page statement", async () => {
    const { result, statements } = await captureStatements(() =>
      page({ limit: 50 })
    );
    expect(result.items.map((item) => item.id)).toEqual(
      COLLECT_FIXTURE_ORDER_ACTIVITY_DESC.filter((id) => id !== E.h)
    );
    expect(result.total).toEqual({ count: 21, isCapped: false });
    const pageStatements = statements.filter((statement) =>
      statement.sql.includes("collect_queue_member")
    );
    expect(pageStatements).toHaveLength(1);
    expect(pageStatements[0]?.sql).toMatch(/left join "evidence"/i);

    const byId = new Map(result.items.map((item) => [item.id, item]));
    const fan = byId.get(R.r1);
    expect(fan).toMatchObject({
      kind: "run",
      state: "running",
      playbookRunId: R.r1,
      evidence: null,
    });
    expect(fan?.jobs.map((job) => job.id).sort()).toEqual(
      [J.a0, J.a1, J.a1r, J.a2, J.a3].sort()
    );
    expect(fan?.jobs.every((job) => job.playbookId === "host-footprint")).toBe(
      true
    );
    const evidenceRow = byId.get(E.a);
    expect(evidenceRow?.evidence).toMatchObject({
      id: E.a,
      processedAt: null,
      deletedAt: null,
    });
    expect(evidenceRow?.jobs.map((job) => job.id).sort()).toEqual(
      [J.cap, J.p, J.x].sort()
    );
    // J.p's input names E.a: its label is read, not the Case's Evidence.
    expect(evidenceRow?.titles.evidence).toEqual({
      [E.a]: `Fixture evidence ${E.a.slice(-3)}`,
    });
    expect(byId.get(J.run)).toMatchObject({
      kind: "job",
      evidence: null,
      titles: { evidence: {}, entity: {} },
    });
  });

  it("lists the hidden Evidence as its own view, with no Jobs", async () => {
    const result = await page({ hidden: true });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: E.h,
      state: "hidden",
      jobs: [],
    });
    expect(result.items[0]?.evidence?.deletedAt).not.toBeNull();
  });

  it("walks every page of a moving key once, when rows change between pages", async () => {
    const first = await page();
    expect(first.items).toHaveLength(5);
    expect(first.nextCursor).not.toBeNull();
    // Restoring the hidden Evidence re-attaches Q and P2: their Job rows leave the queue, and
    // the Evidence row rejoins it, all after the first page was read.
    await evidenceRepo.restore(db, caseId, E.h);
    const seen = first.items.map((item) => item.id);
    let cursor = first.nextCursor;
    for (let pages = 0; cursor !== null && pages < 20; pages += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous cursor
      const next = await page({ cursor });
      seen.push(...next.items.map((item) => item.id));
      cursor = next.nextCursor;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toContain(E.h);
    // Restoring put the Evidence back and took Q and P2 off the queue (a new walk shows it).
    const after = await page({ limit: 50 });
    expect(after.items.map((item) => item.id)).not.toContain(J.q);
    expect(after.items.map((item) => item.id)).toContain(E.h);
    await evidenceRepo.softDelete(db, caseId, E.h);
  });
});

describe("collect.get service", () => {
  it("finds a row by its own id", async () => {
    const found = await locate(R.r1);
    expect(found.focusJobId).toBeNull();
    expect(found.item.id).toBe(R.r1);
  });

  it("finds the row of a member Job, with that Job in focus", async () => {
    const found = await locate(J.k2);
    expect(found.item.id).toBe(E.b);
    expect(found.focusJobId).toBe(J.k2);
  });

  it("prefers the row a Job landed over the rows it only names", async () => {
    // X is a member of E.a (by input) and E.t1 (landed): the landed row wins.
    const found = await locate(J.x);
    expect(found.item.id).toBe(E.t1);
    expect(found.focusJobId).toBe(J.x);
  });

  it("finds a run whose steps all attached through its Evidence row", async () => {
    const found = await locate(R.r3);
    expect(found.item.id).toBe(E.c);
    expect(found.focusJobId).toBe(J.l0);
  });

  it("keeps the list's mode: hidden Evidence only with `hidden`, live rows only without", async () => {
    expect((await locate(E.h, true)).item.id).toBe(E.h);
    const hiddenInLive = await run(
      getCollectItemEffect(caseId, TEST_ORGANIZATION_ID, { id: E.h }).pipe(
        Effect.flip,
        Effect.orDie
      )
    );
    expect(hiddenInLive).toMatchObject({ _tag: "NotFoundError" });
    const liveInHidden = await run(
      getCollectItemEffect(caseId, TEST_ORGANIZATION_ID, {
        id: J.run,
        hidden: true,
      }).pipe(Effect.flip, Effect.orDie)
    );
    expect(liveInHidden).toMatchObject({ _tag: "NotFoundError" });
  });

  it("is not found for an id outside the Case", async () => {
    const missing = await run(
      getCollectItemEffect(caseId, TEST_ORGANIZATION_ID, {
        id: "00000000-0000-4000-8000-0000000000ff",
      }).pipe(Effect.flip, Effect.orDie)
    );
    expect(missing).toMatchObject({
      _tag: "NotFoundError",
      entity: "Collect item",
    });
  });
});

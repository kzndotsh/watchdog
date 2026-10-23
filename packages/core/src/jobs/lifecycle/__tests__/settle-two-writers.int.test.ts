import { beforeEach, describe, expect, it } from "vitest";

import { runDomain } from "@watchdog/core/infra";
import { activity, db, jobsRepo } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import {
  listAllActivity,
  resetTestDb,
  seedCase,
  seedJob,
  twoWriters,
} from "@watchdog/test-db";

import { settleJobEffect } from "../settle.ts";
import type { JobEvent } from "../table.ts";

type Target = { jobId: string; caseId: CaseId };

async function seedOpenJob(status: "queued" | "running") {
  const cased = await seedCase(db);
  const job = await seedJob(db, cased.id, { status });
  // The seed appends its own entry; the tests read only what the writers append.
  await db.delete(activity);
  return { jobId: job.id, caseId: cased.id };
}

function settle(target: Target, event: JobEvent) {
  return runDomain(settleJobEffect(target, event, { finishedAt: new Date() }));
}

async function statusOf(target: Target) {
  return (await jobsRepo.get(db, target.jobId))?.status;
}

/** The Job's status changes in the activity log, as `from -> to`. */
async function moves(target: Target) {
  return (await listAllActivity())
    .filter((row) => row.kind === "job" && row.subjectId === target.jobId)
    .map((row) => row.toValue);
}

const SUCCEED: JobEvent = { kind: "succeed" };
const FAIL: JobEvent = { kind: "fail", cause: "cap_failed" };
const CANCEL: JobEvent = { kind: "cancel", cause: "user_cancelled" };
const CLAIM: JobEvent = { kind: "claim" };

describe("settleJobEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("two writers", () => {
    it.each([
      ["succeed", SUCCEED, "cancel", CANCEL, "succeeded"],
      ["cancel", CANCEL, "succeed", SUCCEED, "cancelled"],
      ["fail", FAIL, "cancel", CANCEL, "failed"],
      ["succeed", SUCCEED, "fail", FAIL, "succeeded"],
    ] as const)(
      "%s then %s: the second waits, finds the Job terminal and moves nothing",
      async (_first, firstEvent, _second, secondEvent, final) => {
        const target = await seedOpenJob("running");
        const race = twoWriters({ pauseAt: "locked" });
        race.pauseAfter(jobsRepo, "lockStatus", "locked");

        const outcome = await race.run({
          a: () => settle(target, firstEvent),
          b: () => settle(target, secondEvent),
        });

        expect(outcome.bBlocked).toBe(true);
        expect(outcome.a).toMatchObject({
          status: "fulfilled",
          value: { status: final },
        });
        expect(outcome.b).toEqual({ status: "fulfilled", value: null });
        expect(await statusOf(target)).toBe(final);
        expect(await moves(target)).toEqual([final]);
      }
    );

    it("a claim that waits on a cancel does not resurrect the Job", async () => {
      const target = await seedOpenJob("queued");
      const race = twoWriters({ pauseAt: "locked" });
      race.pauseAfter(jobsRepo, "lockStatus", "locked");

      const outcome = await race.run({
        a: () => settle(target, CANCEL),
        b: () => settle(target, CLAIM),
      });

      expect(outcome.bBlocked).toBe(true);
      expect(outcome.b).toEqual({ status: "fulfilled", value: null });
      expect(await statusOf(target)).toBe("cancelled");
      expect(await moves(target)).toEqual(["cancelled"]);
    });

    it("a cancel that waits on a claim ends the running Job, one entry per move", async () => {
      const target = await seedOpenJob("queued");
      const race = twoWriters({ pauseAt: "locked" });
      race.pauseAfter(jobsRepo, "lockStatus", "locked");

      const outcome = await race.run({
        a: () => settle(target, CLAIM),
        b: () => settle(target, CANCEL),
      });

      expect(outcome.bBlocked).toBe(true);
      expect(outcome.a).toMatchObject({ value: { status: "running" } });
      expect(outcome.b).toMatchObject({ value: { status: "cancelled" } });
      expect(await moves(target)).toEqual(["running", "cancelled"]);
    });

    it("two claims of a queued Job append one entry: the second is a reclaim", async () => {
      const target = await seedOpenJob("queued");
      const race = twoWriters({ pauseAt: "locked" });
      race.pauseAfter(jobsRepo, "lockStatus", "locked");

      const outcome = await race.run({
        a: () => settle(target, CLAIM),
        b: () => settle(target, CLAIM),
      });

      expect(outcome.bBlocked).toBe(true);
      expect(outcome.a).toMatchObject({ value: { status: "running" } });
      expect(outcome.b).toMatchObject({ value: { status: "running" } });
      expect(await moves(target)).toEqual(["running"]);
    });
  });
});

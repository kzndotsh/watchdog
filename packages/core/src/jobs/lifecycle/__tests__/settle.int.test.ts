import { beforeEach, describe, expect, it } from "vitest";

import { Db, runDomainWith } from "@watchdog/core/infra";
import { activityLogRepo, db, jobsRepo } from "@watchdog/db";
import {
  JOB_STATUSES,
  TERMINAL_JOB_STATUSES,
  type JobStatus,
} from "@watchdog/schemas/shared";
import { resetTestDb, seedCase, seedJob } from "@watchdog/test-db";

import { failJobEffect } from "../../stages/helpers.ts";
import { settleJobEffect } from "../settle.ts";
import {
  allowedFromStatuses,
  JOB_EVENT_KINDS,
  type JobEvent,
} from "../table.ts";

const runDomain = runDomainWith(Db.layer);
const START = { xid: "0", id: 0 } as const;

const EVENTS: readonly JobEvent[] = [
  { kind: "claim" },
  { kind: "succeed" },
  { kind: "fail", cause: "cap_failed" },
  { kind: "cancel", cause: "user_cancelled" },
];

async function jobEntryCount(): Promise<number> {
  const rows = await activityLogRepo.drain(db, { after: START, limit: 1000 });
  return rows.filter((row) => row.kind === "job").length;
}

async function seedTerminal(status: JobStatus) {
  const cased = await seedCase(db);
  const job = await seedJob(db, cased.id, { status });
  return { cased, job };
}

describe("Job lifecycle: a terminal Job never moves", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("covers every event the table knows", () => {
    expect(EVENTS.map((event) => event.kind).sort()).toEqual(
      [...JOB_EVENT_KINDS].sort()
    );
  });

  describe.each(TERMINAL_JOB_STATUSES)("a %s Job", (status) => {
    it.each(EVENTS)("is not moved by settle ($kind)", async (event) => {
      const { cased, job } = await seedTerminal(status);
      const before = await jobsRepo.get(db, job.id);
      const entries = await jobEntryCount();

      const result = await runDomain(
        settleJobEffect({ jobId: job.id, caseId: cased.id }, event, {
          error: "late write",
          finishedAt: new Date(),
        })
      );

      expect(result).toBeNull();
      expect(await jobsRepo.get(db, job.id)).toEqual(before);
      expect(await jobEntryCount()).toBe(entries);
    });

    it("is not moved by failJobEffect", async () => {
      const { cased, job } = await seedTerminal(status);
      const before = await jobsRepo.get(db, job.id);

      await runDomain(
        failJobEffect(job.id, "late failure", {
          caseId: cased.id,
          cause: "stale",
        })
      );

      expect(await jobsRepo.get(db, job.id)).toEqual(before);
    });

    it("is not moved by the repo writer under any derived guard", async () => {
      const { cased, job } = await seedTerminal(status);
      const before = await jobsRepo.get(db, job.id);
      for (const kind of JOB_EVENT_KINDS) {
        for (const target of JOB_STATUSES) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- one write per pair, in order
          const moved = await jobsRepo.settle(
            db,
            cased.id,
            job.id,
            { status: target, errorCode: "stale" },
            allowedFromStatuses(kind)
          );
          expect(moved).toBeNull();
        }
      }
      expect(await jobsRepo.get(db, job.id)).toEqual(before);
    });

    it("is not moved by the cancel writers", async () => {
      const { cased, job } = await seedTerminal(status);
      const before = await jobsRepo.get(db, job.id);
      const now = new Date();

      expect(await jobsRepo.cancelCancellable(db, job.id, now)).toBeNull();
      expect(
        await jobsRepo.cancelCancellableInCase(db, cased.id, job.id, now)
      ).toBeNull();
      expect(
        await jobsRepo.cancelAllCancellableForCase(db, cased.id, now)
      ).toEqual([]);
      expect(await jobsRepo.get(db, job.id)).toEqual(before);
    });
  });
});

describe("Job lifecycle: moves from an open status", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("claims, then succeeds, with one entry per change of status", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "queued" });
    const target = { jobId: job.id, caseId: cased.id };
    const entries = await jobEntryCount();

    const claimed = await runDomain(
      settleJobEffect(target, { kind: "claim" }, { startedAt: new Date() })
    );
    expect(claimed?.status).toBe("running");
    const reclaimed = await runDomain(
      settleJobEffect(target, { kind: "claim" })
    );
    expect(reclaimed?.status).toBe("running");
    const done = await runDomain(
      settleJobEffect(target, { kind: "succeed" }, { finishedAt: new Date() })
    );

    expect(done?.status).toBe("succeeded");
    expect(done?.errorCode).toBeNull();
    // queued -> running -> succeeded: the reclaim is not an entry.
    expect(await jobEntryCount()).toBe(entries + 2);
  });

  it.each([
    ["queued", "fail", "failed"],
    ["running", "fail", "failed"],
    ["queued", "cancel", "cancelled"],
    ["running", "cancel", "cancelled"],
  ] as const)(
    "a %s Job takes %s and stores its cause",
    async (from, kind, to) => {
      const cased = await seedCase(db);
      const job = await seedJob(db, cased.id, { status: from });

      const settled = await runDomain(
        settleJobEffect(
          { jobId: job.id, caseId: cased.id },
          { kind, cause: kind === "fail" ? "cap_timeout" : "case_deleted" },
          { error: "why" }
        )
      );

      expect(settled?.status).toBe(to);
      expect(settled?.errorCode).toBe(
        kind === "fail" ? "cap_timeout" : "case_deleted"
      );
      expect(settled?.error).toBe("why");
    }
  );

  it("does not succeed a queued Job that never ran", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "queued" });

    const result = await runDomain(
      settleJobEffect({ jobId: job.id, caseId: cased.id }, { kind: "succeed" })
    );

    expect(result).toBeNull();
    expect((await jobsRepo.get(db, job.id))?.status).toBe("queued");
  });

  it("ignores a Job addressed through another Case", async () => {
    const cased = await seedCase(db);
    const other = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "running" });

    const result = await runDomain(
      settleJobEffect(
        { jobId: job.id, caseId: other.id },
        { kind: "fail", cause: "cap_failed" }
      )
    );

    expect(result).toBeNull();
    expect((await jobsRepo.get(db, job.id))?.status).toBe("running");
  });
});

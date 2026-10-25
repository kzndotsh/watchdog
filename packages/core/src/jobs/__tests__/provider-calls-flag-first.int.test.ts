import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { db, jobsRepo, providerCallsRepo } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import { resetTestDb, seedCase, seedJob } from "@watchdog/test-db";
import { makeJobEgress } from "@watchdog/tools/http";

import { recordingBlobStore } from "../../infra/blob-store";
import { Db } from "../../infra/db-service";
import { runDomainWith } from "../../infra/run-domain";
import { persistProviderCallsBestEffort } from "../provider-calls";

/** A running Job with one finished direct call; its kept body needs the object store. */
async function stoppedRun(
  caseId: CaseId,
  provenanceState?: "complete" | "incomplete"
) {
  const seeded = await seedJob(db, caseId, { status: "running" });
  const job =
    provenanceState === undefined
      ? seeded
      : await jobsRepo.update(db, seeded.id, { provenanceState });
  if (!job) throw new Error("job missing");
  const scope = {
    caseId,
    jobId: job.id,
    runId: "00000000-0000-4000-8000-0000000000e1",
  };
  const { ledger } = makeJobEgress({
    fetch: async () => new Response("x"),
    fetchPrivateOrigin: async () => new Response("x"),
  });
  ledger
    .beginDirect({
      transport: "dns",
      method: "A",
      url: "dns:example.test?type=A",
      bodyKind: "dns_answer_json",
    })
    .answered({ status: 0, body: new TextEncoder().encode("[]") });
  return { job, scope, ledger };
}

/** A stuck database: another transaction holds the Job's row, so an UPDATE of it waits. */
async function holdJobRow(caseId: CaseId, jobId: string) {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let locked: () => void = () => undefined;
  const lockTaken = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const holding = db.transaction(async (tx) => {
    await jobsRepo.lockStatus(tx, caseId, jobId);
    locked();
    await gate;
  });
  await lockTaken;
  return {
    release: async () => {
      open();
      await holding;
    },
  };
}

/** A store whose body upload never answers. */
function hungStore() {
  return recordingBlobStore({
    respond: async (call) =>
      call.command === "PutObjectCommand"
        ? new Promise<undefined>(() => {
            // Never settles: a hung store.
          })
        : undefined,
  });
}

const provenanceOf = async (jobId: string) =>
  (await jobsRepo.get(db, jobId))?.provenanceState;

describe("a stopped run is flagged incomplete before its calls are saved", () => {
  let caseId: CaseId;

  beforeEach(async () => {
    await resetTestDb();
    caseId = (await seedCase(db)).id;
  });

  it("ends incomplete when the save and the flag both stall, never complete", async () => {
    const { job, scope, ledger } = await stoppedRun(caseId);
    const lock = await holdJobRow(caseId, job.id);
    const started = Date.now();

    await runDomainWith(Layer.mergeAll(Db.layer, hungStore().layer))(
      persistProviderCallsBestEffort(scope, () => ledger.drain(), 800)
    );
    const held = Date.now() - started;
    await lock.release();

    expect(held).toBeLessThan(1500);
    // The pessimistic write was issued first and lands once the lock clears; nothing wrote
    // `complete` over it.
    await expect.poll(async () => provenanceOf(job.id)).toBe("incomplete");
  });

  it("ends incomplete when the database stalls once the save has begun and the store hangs too", async () => {
    const { job, scope, ledger } = await stoppedRun(caseId);
    let lock: Awaited<ReturnType<typeof holdJobRow>> | undefined;
    // The database goes quiet as the body upload starts, and the store never answers: the save
    // and any later write to the Job both stall.
    const store = recordingBlobStore({
      respond: async (call) => {
        if (call.command !== "PutObjectCommand") return undefined;
        lock = await holdJobRow(caseId, job.id);
        return new Promise<undefined>(() => {
          // Never settles: a hung store.
        });
      },
    });
    const started = Date.now();

    await runDomainWith(Layer.mergeAll(Db.layer, store.layer))(
      persistProviderCallsBestEffort(scope, () => ledger.drain(), 800)
    );
    const held = Date.now() - started;
    // The Job's row is still locked as the stop settles; a plain read is not blocked by it.
    const atStop = await provenanceOf(job.id);
    await lock?.release();

    expect(held).toBeLessThan(1500);
    expect(atStop).toBe("incomplete");
    expect(await provenanceOf(job.id)).toBe("incomplete");
  });

  it("flags the Job before it saves anything", async () => {
    const { job, scope, ledger } = await stoppedRun(caseId);
    let seen: string | undefined;
    const spying = recordingBlobStore({
      respond: async (call) => {
        if (call.command === "PutObjectCommand") {
          seen = await provenanceOf(job.id);
        }
        return undefined;
      },
    });

    await runDomainWith(Layer.mergeAll(Db.layer, spying.layer))(
      persistProviderCallsBestEffort(scope, () => ledger.drain())
    );

    expect(seen).toBe("incomplete");
  });

  it("ends complete when the save completes", async () => {
    const { job, scope, ledger } = await stoppedRun(caseId);

    await runDomainWith(Layer.mergeAll(Db.layer, recordingBlobStore().layer))(
      persistProviderCallsBestEffort(scope, () => ledger.drain())
    );

    expect(await provenanceOf(job.id)).toBe("complete");
    expect(await providerCallsRepo.listForJob(db, caseId, job.id)).toHaveLength(
      1
    );
  });

  it("keeps a gap an earlier run left when a later run saves fully", async () => {
    const { job, scope, ledger } = await stoppedRun(caseId, "incomplete");

    await runDomainWith(Layer.mergeAll(Db.layer, recordingBlobStore().layer))(
      persistProviderCallsBestEffort(scope, () => ledger.drain())
    );

    expect(await provenanceOf(job.id)).toBe("incomplete");
  });

  it("ends incomplete when the save fails", async () => {
    const { job, scope, ledger } = await stoppedRun(caseId);
    const failing = recordingBlobStore({
      respond: (call) => {
        if (call.command === "PutObjectCommand") throw new Error("store down");
      },
    });

    await runDomainWith(Layer.mergeAll(Db.layer, failing.layer))(
      persistProviderCallsBestEffort(scope, () => ledger.drain())
    );

    expect(await provenanceOf(job.id)).toBe("incomplete");
  });
});

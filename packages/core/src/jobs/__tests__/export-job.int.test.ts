import { randomBytes, randomUUID } from "node:crypto";

import { Effect, Layer } from "effect";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { casesRepo, db, jobsRepo } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  listAllActivity,
  resetActorAccess,
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
  seedOrganizationMember,
  twoWriters,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { outboundClientLayer } from "@watchdog/tools/http";

import { measureCaseExportEffect } from "../../export/case-export";
import {
  archiveStoredAtEffect,
  caseExportObjectKey,
  sweepExpiredCaseExportsEffect,
} from "../../export/export-objects";
import type { CaseExportSettings } from "../../export/settings";
import {
  blobStoreLayer,
  deleteCaseArtifactsEffect,
  readArtifactBytesEffect,
  uploadArtifactEffect,
} from "../../infra/blob";
import { Db } from "../../infra/db-service";
import { vaultLayer } from "../../infra/vault";
import { cancelJobEffect } from "../cancel-jobs";
import { caseExportLinkEffect, startCaseExportJobEffect } from "../export-job";
import { JobFibers } from "../job-fibers";
import { recordingJobQueue } from "../job-queue";
import { executeJobEffect } from "../run-job";
import { CASE_EXPORT_JOB } from "../system-jobs";

const MIB = 1024 * 1024;
const LINK_TTL_MS = 2500;

/** An export of this Case is "large": the threshold is below its Evidence. */
const SETTINGS: CaseExportSettings = {
  inlineMaxBytes: 1 * MIB,
  linkTtlMs: LINK_TTL_MS,
  concurrency: 3,
};

const queue = recordingJobQueue();
const services = Layer.mergeAll(
  Layer.provideMerge(vaultLayer, Db.layer),
  blobStoreLayer,
  outboundClientLayer,
  queue.layer,
  JobFibers.layer
);

function program<A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof services>>
) {
  return Effect.runPromise(
    effect.pipe(Effect.provide(services), Effect.scoped)
  );
}

/** Cases whose objects (files and export archives) the test left in the shared bucket. */
const seeded: Parameters<typeof deleteCaseArtifactsEffect>[0][] = [];

async function seedLargeCase() {
  const cased = await seedCase(db, { name: "Large export" });
  seeded.push(cased.id);
  await seedEntity(db, cased.id, { id: randomUUID(), name: "Bob Example" });
  const stored = await program(
    uploadArtifactEffect({
      caseId: cased.id,
      bytes: randomBytes(3 * MIB),
      mime: "application/octet-stream",
      name: "big.bin",
    })
  );
  await seedEvidence(db, cased.id, {
    kind: "file",
    label: "big.bin",
    uri: stored.uri,
    sha256: stored.sha256,
    text: null,
  });
  return cased;
}

function startExport(caseId: CaseId) {
  return program(
    startCaseExportJobEffect({
      caseId,
      organizationId: TEST_ORGANIZATION_ID,
      actorId: TEST_ACTOR_ID,
    })
  );
}

describe("a large Case export runs as a Job", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "member",
    });
    await resetActorAccess(db, { userId: TEST_ACTOR_ID, keyId: "wd476-key" });
    queue.sends.length = 0;
  });

  afterEach(async () => {
    for (const caseId of seeded.splice(0)) {
      // oxlint-disable-next-line no-await-in-loop -- one Case's objects at a time
      await program(deleteCaseArtifactsEffect(caseId));
    }
  });

  it("is over the threshold, queues one Job, runs it, stores the archive and tells the feed", async () => {
    const cased = await seedLargeCase();

    const measured = await program(
      measureCaseExportEffect(cased.id, cased.organizationId, SETTINGS)
    );
    expect(measured).toMatchObject({ kind: "ok", overLimit: true });

    const started = await startExport(cased.id);
    expect(started).toMatchObject({ status: "queued", created: true });
    expect(queue.sends).toHaveLength(1);
    expect(queue.sends[0]?.payload).toEqual({ jobId: started.jobId });
    // Asking again while it is open joins it: one archive, one Job.
    const again = await startExport(cased.id);
    expect(again).toMatchObject({ jobId: started.jobId, created: false });
    expect(queue.sends).toHaveLength(1);

    const pending = await program(
      caseExportLinkEffect(
        {
          caseId: cased.id,
          organizationId: cased.organizationId,
          jobId: started.jobId,
        },
        SETTINGS
      )
    );
    expect(pending).toEqual({ kind: "pending", status: "queued" });

    const outcome = await program(executeJobEffect(started.jobId));
    expect(outcome).toMatchObject({
      outcome: "succeeded",
      capabilityId: CASE_EXPORT_JOB,
    });

    const row = await jobsRepo.get(db, started.jobId);
    expect(row).toMatchObject({
      status: "succeeded",
      errorCode: null,
      capabilityId: CASE_EXPORT_JOB,
    });
    expect(row?.resultSummary).toMatch(
      /^Case export ready: 2 notes, 1 Evidence files/
    );

    // The notification is the Job's own status entries, the feed's existing channel (`logged`
    // entries are the live log signal, not a status).
    const entries = (await listAllActivity(db)).filter(
      (entry) =>
        entry.kind === "job" &&
        entry.subjectId === started.jobId &&
        entry.action !== "logged"
    );
    expect(entries.map((entry) => entry.toValue)).toEqual([
      "queued",
      "running",
      "succeeded",
    ]);

    const archive = await program(
      readArtifactBytesEffect(caseExportObjectKey(cased.id, started.jobId))
    );
    const names = Object.keys(unzipSync(archive));
    expect(names).toContain(`${cased.slug}/CASE.md`);
    expect(names.some((name) => name.includes("--big"))).toBe(true);
  }, 60_000);

  it("gives a download link that works, then expires, and the sweep deletes the archive", async () => {
    const cased = await seedLargeCase();
    const started = await startExport(cased.id);
    await program(executeJobEffect(started.jobId));
    const askLink = () =>
      program(
        caseExportLinkEffect(
          {
            caseId: cased.id,
            organizationId: cased.organizationId,
            jobId: started.jobId,
          },
          SETTINGS
        )
      );

    const ready = await askLink();
    expect(ready.kind).toBe("ready");
    if (ready.kind !== "ready") return;
    expect(ready.filename).toMatch(new RegExp(`^${cased.slug}-\\d{12}\\.zip$`));
    const downloaded = await fetch(ready.url);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get("content-disposition")).toContain(
      ready.filename
    );
    expect(
      Object.keys(unzipSync(new Uint8Array(await downloaded.arrayBuffer())))
    ).toContain(`${cased.slug}/CASE.md`);

    // Not swept while the link is live.
    const key = caseExportObjectKey(cased.id, started.jobId);
    await program(sweepExpiredCaseExportsEffect(SETTINGS));
    expect(
      (await program(readArtifactBytesEffect(key))).byteLength
    ).toBeGreaterThan(0);

    // Poll the real clock until the link's lifetime has run out.
    await expect
      .poll(askLink, { interval: 100, timeout: 10_000 })
      .toMatchObject({ kind: "expired", expiredAt: ready.expiresAt });
    // The signed URL it handed out did not outlive the link either.
    expect((await fetch(ready.url)).status).toBe(403);

    expect(
      await program(sweepExpiredCaseExportsEffect(SETTINGS))
    ).toBeGreaterThanOrEqual(1);
    await expect(program(readArtifactBytesEffect(key))).rejects.toMatchObject({
      _tag: "InvalidError",
    });
  }, 60_000);

  it("answers a Job that ended without an archive, and a Job that is not an export", async () => {
    const cased = await seedLargeCase();
    const started = await startExport(cased.id);
    await program(
      cancelJobEffect(cased.id, cased.organizationId, started.jobId, {
        actorId: TEST_ACTOR_ID,
      })
    );
    const ended = await program(
      caseExportLinkEffect(
        {
          caseId: cased.id,
          organizationId: cased.organizationId,
          jobId: started.jobId,
        },
        SETTINGS
      )
    );
    expect(ended).toMatchObject({ kind: "ended", status: "cancelled" });

    await expect(
      program(
        caseExportLinkEffect(
          {
            caseId: cased.id,
            organizationId: cased.organizationId,
            jobId: randomUUID(),
          },
          SETTINGS
        )
      )
    ).rejects.toMatchObject({ _tag: "NotFoundError" });
  });

  it("two requests at once yield one Job, one queue message and one archive", async () => {
    const cased = await seedCase(db, { name: "Raced export" });
    const race = twoWriters({ pauseAt: "locked" });
    race.pauseAfter(casesRepo, "lockById", "locked");

    const outcome = await race.run({
      a: () => startExport(cased.id),
      b: () => startExport(cased.id),
    });

    // B waited on A's lock on the Case, then saw A's open Job and joined it.
    expect(outcome.bBlocked).toBe(true);
    if (outcome.a.status !== "fulfilled" || outcome.b.status !== "fulfilled") {
      throw new Error("both requests should be answered");
    }
    expect(outcome.a.value.created).toBe(true);
    expect(outcome.b.value).toMatchObject({
      jobId: outcome.a.value.jobId,
      created: false,
    });
    const open = await jobsRepo.listActiveForCapability(
      db,
      cased.id,
      CASE_EXPORT_JOB
    );
    expect(open.map((job) => job.id)).toEqual([outcome.a.value.jobId]);
    expect(queue.sends).toHaveLength(1);
  });

  it("the link and the sweep agree on the instant an archive expires", async () => {
    const cased = await seedLargeCase();
    const started = await startExport(cased.id);
    await program(executeJobEffect(started.jobId));
    const settings = { ...SETTINGS, linkTtlMs: 60_000 };
    const key = caseExportObjectKey(cased.id, started.jobId);
    const storedAt = await program(archiveStoredAtEffect(key));
    if (storedAt === null) throw new Error("the archive should be stored");
    const askLink = () =>
      program(
        caseExportLinkEffect(
          {
            caseId: cased.id,
            organizationId: cased.organizationId,
            jobId: started.jobId,
          },
          settings
        )
      );
    const expiry = storedAt.getTime() + settings.linkTtlMs;

    // Only the clock is faked: the store and the database run in real time.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // One millisecond before: the link answers, and the sweep leaves the file.
      vi.setSystemTime(expiry - 1);
      expect((await askLink()).kind).toBe("ready");
      await program(sweepExpiredCaseExportsEffect(settings));
      expect((await program(archiveStoredAtEffect(key)))?.getTime()).toBe(
        storedAt.getTime()
      );

      // At the instant: the link has expired, and the sweep takes the file.
      vi.setSystemTime(expiry);
      expect((await askLink()).kind).toBe("expired");
      expect(
        await program(sweepExpiredCaseExportsEffect(settings))
      ).toBeGreaterThanOrEqual(1);
      expect(await program(archiveStoredAtEffect(key))).toBeNull();
      // A swept archive is an expired link, never a redirect to a missing file.
      expect((await askLink()).kind).toBe("expired");
    } finally {
      vi.useRealTimers();
    }
  }, 60_000);
});

import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { recordingBlobStore } from "@watchdog/core/blob";
import {
  deleteCaseEffect,
  purgeCaseEffect,
  restoreCaseEffect,
} from "@watchdog/core/cases";
import { Db, runDomainWith, transact } from "@watchdog/core/infra";
import { db, evidenceLinksRepo, evidenceRepo } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import {
  COLLECT_FIXTURE,
  TEST_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  collectQueueDiff,
  listCollectQueueStale,
  readCollectQueue,
  resetActorAccess,
  resetTestDb,
  seedCase,
  seedCollectQueueFixture,
  seedOrganizationMember,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { jobsRepoFx } from "../../../infra/repos-fx.ts";
import { recordingJobQueue } from "../../job-queue.ts";
import { joinPlaybookRunEffect } from "../../retry-resume.ts";
import { settleJobEffect } from "../settle.ts";

/*
 * The fixture transitions of Collect's queue (#574), each committed through the app's own write
 * paths (the Job lifecycle, the run join, Evidence hide and restore, Case delete, restore and
 * purge), then checked against hand-written expectations and a full rebuild.
 */

const E = COLLECT_FIXTURE.evidence;
const J = COLLECT_FIXTURE.jobs;
const R = COLLECT_FIXTURE.runs;
const caller = { organizationId: TEST_ORGANIZATION_ID, actorId: TEST_ACTOR_ID };
const run = runDomainWith(
  Layer.mergeAll(
    Db.layer,
    recordingJobQueue().layer,
    recordingBlobStore().layer
  )
);

async function rowsById(caseId: CaseId) {
  return new Map(
    (await readCollectQueue(db, caseId)).map((row) => [row.id, row])
  );
}

async function expectConsistent(caseId: CaseId) {
  expect(await collectQueueDiff(db, caseId)).toEqual([]);
  expect(await listCollectQueueStale()).toEqual([]);
}

function settle(
  caseId: CaseId,
  jobId: string,
  kind: "succeed" | "fail" | "claim"
) {
  const event =
    kind === "fail"
      ? ({ kind, cause: "cap_failed" } as const)
      : ({ kind } as const);
  return run(
    settleJobEffect({ jobId, caseId }, event, { finishedAt: new Date() })
  );
}

describe("Collect queue fixture transitions", () => {
  let caseId: CaseId;

  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "owner",
    });
    await resetActorAccess(db, { userId: TEST_ACTOR_ID, keyId: "wd574-key" });
    caseId = (await seedCase(db)).id;
    await seedCollectQueueFixture(db, caseId);
    await expectConsistent(caseId);
  });

  it("1. a lone running Cap lands Evidence and settles: its row moves onto the Evidence", async () => {
    const landed = await evidenceRepo.create(db, {
      caseId,
      kind: "attestation",
      label: "landed by J_run",
      text: "body",
      actorId: TEST_ACTOR_ID,
    });
    if (landed === null) throw new Error("no Evidence");
    await evidenceLinksRepo.linkJob(db, caseId, J.run, [landed.id]);
    await settle(caseId, J.run, "succeed");

    const rows = await rowsById(caseId);
    expect(rows.has(J.run)).toBe(false);
    expect(rows.get(landed.id)?.members).toEqual([J.run]);
    await expectConsistent(caseId);
  });

  it("2. hiding Evidence frees its Jobs into rows of their own; restoring takes them back", async () => {
    const before = await rowsById(caseId);
    await evidenceRepo.softDelete(db, caseId, E.a);
    const hidden = await rowsById(caseId);
    const hiddenAt = hidden.get(J.cap)?.activityAt ?? 0;
    expect(hidden.get(E.a)).toMatchObject({ state: "hidden", members: [] });
    expect(hidden.get(J.cap)).toMatchObject({ kind: "job", state: "landed" });
    expect(hidden.get(J.p)).toMatchObject({ kind: "job", state: "running" });
    // They rise to the hide; the Evidence row keeps its capture time.
    expect(hiddenAt).toBeGreaterThan(before.get(E.a)?.activityAt ?? 0);
    expect(hidden.get(J.p)?.activityAt).toBe(hiddenAt);
    expect(hidden.get(E.a)?.activityAt).toBe(before.get(E.a)?.activityAt);
    // X also landed E_t1, so it stays there.
    expect(hidden.get(E.t1)?.members).toEqual([J.x]);
    await expectConsistent(caseId);

    await evidenceRepo.restore(db, caseId, E.a);
    const restored = await rowsById(caseId);
    expect(restored.get(E.a)).toEqual(before.get(E.a));
    expect(restored.has(J.cap)).toBe(false);
    expect(restored.has(J.p)).toBe(false);
    await expectConsistent(caseId);
  });

  it("3-4. a fan-out settles failed, then a retry joined to the run lands it", async () => {
    const sortAt = (await rowsById(caseId)).get(R.r1)?.sortAt;
    await settle(caseId, J.a2, "succeed");
    await settle(caseId, J.a3, "fail");
    // A3 failed; A1's earlier failure does not count, A1r retried it.
    expect((await rowsById(caseId)).get(R.r1)?.state).toBe("failed");
    await expectConsistent(caseId);

    const retry = await run(
      transact((tx) =>
        Effect.gen(function* joinRetryGen() {
          yield* joinPlaybookRunEffect(
            tx,
            { playbookRunId: R.r1, playbookStep: 1, playbookFanIndex: 2 },
            TEST_ACTOR_ID
          );
          return yield* jobsRepoFx.create(tx, {
            caseId,
            capabilityId: "network.dns.lookup",
            input: { host: "retry.example" },
            status: "queued",
            actorId: TEST_ACTOR_ID,
            playbookRunId: R.r1,
            playbookStep: 1,
            playbookFanIndex: 2,
            retryOfJobId: J.a3,
          });
        })
      )
    );
    if (retry === null) throw new Error("no retry");
    expect((await rowsById(caseId)).get(R.r1)?.state).toBe("queued");
    await settle(caseId, retry.id, "claim");
    expect((await rowsById(caseId)).get(R.r1)?.state).toBe("running");
    await settle(caseId, retry.id, "succeed");
    const r1 = (await rowsById(caseId)).get(R.r1);
    expect(r1?.state).toBe("landed");
    expect(r1?.sortAt).toBe(sortAt);
    expect(r1?.members).toContain(retry.id);
    await expectConsistent(caseId);
  });

  it("6. a tombstone freezes the Case, a restore rebuilds it, a purge clears it", async () => {
    const before = await readCollectQueue(db, caseId);
    await run(deleteCaseEffect(caseId, caller));
    // The delete cancelled the open Jobs, but nothing reads a tombstoned Case: frozen.
    expect(await readCollectQueue(db, caseId)).toEqual(before);

    await run(restoreCaseEffect(caseId, caller));
    await expectConsistent(caseId);
    expect((await rowsById(caseId)).get(J.run)?.state).toBe("cancelled");

    await run(deleteCaseEffect(caseId, caller));
    await run(purgeCaseEffect(caseId, caller));
    expect(await readCollectQueue(db, caseId)).toEqual([]);
    expect(await listCollectQueueStale()).toEqual([]);
  });
});

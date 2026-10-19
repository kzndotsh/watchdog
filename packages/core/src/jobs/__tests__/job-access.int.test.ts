import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { recordingBlobStore } from "@watchdog/core/blob";
import { startJobEffect } from "@watchdog/core/jobs";
import { vaultLayer } from "@watchdog/core/vault";
import { db, jobsRepo, playbookRunsRepo } from "@watchdog/db";
import { asOrganizationId } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  banUser,
  deleteApiKey,
  removeOrganizationMember,
  resetActorAccess,
  resetTestDb,
  seedApiKey,
  seedCase,
  seedJob,
  seedOrganizationMember,
  seedPlaybookRun,
  updateApiKey,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { Db } from "../../infra/db-service.ts";
import { runDomainWith } from "../../infra/run-domain.ts";
import { JobFibers } from "../job-fibers.ts";
import { recordingJobQueue } from "../job-queue.ts";
import { executeJobEffect } from "../run-job.ts";
import { advancePlaybookRunEffect } from "../stages/chain.ts";
import { preflightEffect } from "../stages/preflight.ts";

/** Every service a preflight or a whole Job run needs; enqueues land in the given recording queue. */
function runnerWith(queue: ReturnType<typeof recordingJobQueue>) {
  return runDomainWith(
    Layer.mergeAll(
      Layer.provideMerge(vaultLayer, Db.layer),
      queue.layer,
      recordingBlobStore().layer,
      JobFibers.layer
    )
  );
}

const runDomain = runnerWith(recordingJobQueue());

const KEY_ID = "wd371-key";
const HOUR = 3_600_000;

function seedKey(
  overrides: { enabled?: boolean; expiresAt?: Date; ownerId?: string } = {}
): Promise<void> {
  const { ownerId = TEST_ACTOR_ID, ...rest } = overrides;
  return seedApiKey(db, { id: KEY_ID, ownerId, ...rest });
}

describe("Job preflight re-checks the creator's access", () => {
  beforeEach(async () => {
    await resetTestDb();
    // `auth.*` survives resetTestDb: start from a member, an unbanned user and no key.
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "member",
    });
    await resetActorAccess(db, { userId: TEST_ACTOR_ID, keyId: KEY_ID });
  });

  it("runs the Job of a member who is not banned", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id);
    const result = await runDomain(preflightEffect(job.id));
    expect(result.kind).toBe("ready");
  });

  it("cancels a queued Job whose creator left the organization", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id);
    await removeOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
    });

    const result = await runDomain(preflightEffect(job.id));

    expect(result).toEqual({ kind: "stop", reason: "access_revoked" });
    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("cancelled");
    expect(row?.error).toBe(
      "Cancelled: the creator of this Job is no longer a member of the organization"
    );
    expect(row?.finishedAt).not.toBeNull();
  });

  it("cancels a Job whose creator now belongs to another organization only", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id);
    await removeOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
    });
    await seedOrganizationMember(db, {
      organizationId: asOrganizationId("wd371-other-org"),
      userId: TEST_ACTOR_ID,
      role: "owner",
    });
    const result = await runDomain(preflightEffect(job.id));
    expect(result).toEqual({ kind: "stop", reason: "access_revoked" });
  });

  it("cancels a Job whose creator was banned", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id);
    await banUser(db, TEST_ACTOR_ID);

    const result = await runDomain(preflightEffect(job.id));

    expect(result).toEqual({ kind: "stop", reason: "access_revoked" });
    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("cancelled");
    expect(row?.error).toBe("Cancelled: the creator of this Job is banned");
  });

  it("does not cancel for a ban that has expired", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id);
    await banUser(db, TEST_ACTOR_ID, new Date(Date.now() - HOUR));
    const result = await runDomain(preflightEffect(job.id));
    expect(result.kind).toBe("ready");
  });

  it("cancels a Job started by a since-deleted API key", async () => {
    const cased = await seedCase(db);
    await seedKey();
    const job = await seedJob(db, cased.id, { actorKeyId: KEY_ID });
    await deleteApiKey(db, KEY_ID);

    const result = await runDomain(preflightEffect(job.id));

    expect(result).toEqual({ kind: "stop", reason: "access_revoked" });
    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("cancelled");
    expect(row?.error).toBe(
      "Cancelled: the API key that started this Job no longer exists"
    );
  });

  it("cancels a Job whose API key was disabled or has expired", async () => {
    const cased = await seedCase(db);
    await seedKey({ enabled: false });
    const disabled = await seedJob(db, cased.id, { actorKeyId: KEY_ID });
    expect(await runDomain(preflightEffect(disabled.id))).toEqual({
      kind: "stop",
      reason: "access_revoked",
    });
    expect((await jobsRepo.get(db, disabled.id))?.error).toBe(
      "Cancelled: the API key that started this Job was disabled"
    );

    await updateApiKey(db, KEY_ID, {
      enabled: true,
      expiresAt: new Date(Date.now() - HOUR),
    });
    const expired = await seedJob(db, cased.id, { actorKeyId: KEY_ID });
    expect(await runDomain(preflightEffect(expired.id))).toEqual({
      kind: "stop",
      reason: "access_revoked",
    });
    expect((await jobsRepo.get(db, expired.id))?.error).toBe(
      "Cancelled: the API key that started this Job has expired"
    );
  });

  it("cancels a Job whose key id now belongs to another user", async () => {
    const cased = await seedCase(db);
    await seedKey({ ownerId: "someone-else" });
    const job = await seedJob(db, cased.id, { actorKeyId: KEY_ID });
    const result = await runDomain(preflightEffect(job.id));
    expect(result).toEqual({ kind: "stop", reason: "access_revoked" });
  });

  it("runs a Job whose API key still exists", async () => {
    const cased = await seedCase(db);
    await seedKey({ expiresAt: new Date(Date.now() + HOUR) });
    const job = await seedJob(db, cased.id, { actorKeyId: KEY_ID });
    const result = await runDomain(preflightEffect(job.id));
    expect(result.kind).toBe("ready");
  });

  it("leaves a session-started Job alone: it never consults the key table", async () => {
    const cased = await seedCase(db);
    // A key the session user once owned is gone; the Job carries no key id.
    const job = await seedJob(db, cased.id, { actorKeyId: null });
    const result = await runDomain(preflightEffect(job.id));
    expect(result.kind).toBe("ready");
  });

  it("stores the key id of the credential that started the Job", async () => {
    const cased = await seedCase(db);
    await seedKey();
    const started = await runDomain(
      startJobEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        capabilityId: "network.dns.lookup",
        input: { host: "mailhost.test" },
        actorId: TEST_ACTOR_ID,
        actorLabel: "api-key:wd371",
        actorKeyId: KEY_ID,
      })
    );
    expect((await jobsRepo.get(db, started.id))?.actorKeyId).toBe(KEY_ID);

    const session = await runDomain(
      startJobEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        capabilityId: "network.dns.lookup",
        input: { host: "mailhost.test" },
        actorId: TEST_ACTOR_ID,
      })
    );
    expect((await jobsRepo.get(db, session.id))?.actorKeyId).toBeNull();
  });
});

describe("Playbook steps re-check access", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "member",
    });
    await resetActorAccess(db, { userId: TEST_ACTOR_ID, keyId: KEY_ID });
  });

  it("gives a chained step the run's key id and cancels it when the key is gone", async () => {
    const cased = await seedCase(db);
    await seedKey();
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-footprint",
      seed: { host: "mailhost.test" },
      actorKeyId: KEY_ID,
    });
    const first = await seedJob(db, cased.id, {
      capabilityId: "network.dns.lookup",
      input: { host: "mailhost.test" },
      status: "succeeded",
      playbookRunId: run.id,
      playbookStep: 0,
      actorKeyId: KEY_ID,
    });
    expect(first.actorKeyId).toBe(KEY_ID);

    await runDomain(
      advancePlaybookRunEffect({ playbookRunId: run.id, caseId: cased.id })
    );
    const members = await jobsRepo.listForPlaybookRun(db, run.id);
    const next = members.find((j) => j.playbookStep === 1);
    expect(next?.actorKeyId).toBe(KEY_ID);
    if (next === undefined) throw new TypeError("expected a step 1 Job");

    await deleteApiKey(db, KEY_ID);
    const result = await runDomain(preflightEffect(next.id));

    expect(result).toEqual({ kind: "stop", reason: "access_revoked" });
    expect((await jobsRepo.get(db, next.id))?.status).toBe("cancelled");
  });

  it("ends the run when its first step is cancelled for lost access", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-footprint",
      seed: { host: "mailhost.test" },
    });
    const job = await seedJob(db, cased.id, {
      capabilityId: "network.dns.lookup",
      input: { host: "mailhost.test" },
      playbookRunId: run.id,
      playbookStep: 0,
    });
    await removeOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
    });

    const fresh = recordingJobQueue();
    const outcome = await runnerWith(fresh)(executeJobEffect(job.id));

    expect(outcome.outcome).toBe("cancelled");
    expect(outcome.stopReason).toBe("access_revoked");
    expect((await playbookRunsRepo.get(db, run.id))?.status).toBe("finished");
    expect(fresh.sends).toEqual([]);
  });
});

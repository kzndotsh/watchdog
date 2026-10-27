import { randomUUID } from "node:crypto";

import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { recordingBlobStore } from "@watchdog/core/blob";
import { JobStartLimitError, isDomainTag } from "@watchdog/core/errors";
import { processEvidenceEffect } from "@watchdog/core/evidence";
import { Db, runDomainWith } from "@watchdog/core/infra";
import {
  recordingJobQueue,
  retryJobEffect,
  runPlaybookEffect,
  startJobEffect,
} from "@watchdog/core/jobs";
import { getJobStartLimitsEffect } from "@watchdog/core/organization";
import { vaultLayer } from "@watchdog/core/vault";
import { db, jobStartLimitsRepo } from "@watchdog/db";
import {
  EGRESS_CLASSES,
  type CaseId,
  type OrganizationId,
} from "@watchdog/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  forceJobStatus,
  listCaseJobs,
  resetTestDb,
  seedApiKey,
  seedCase,
  seedEvidence,
  seedOrganizationMember,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { startCaseExportJobEffect } from "../export-job";

// Enqueues land in a recording queue instead of a real pg-boss.
const queue = recordingJobQueue();
const runDomain = runDomainWith(
  Layer.mergeAll(
    Layer.provideMerge(vaultLayer, Db.layer),
    queue.layer,
    recordingBlobStore().layer
  )
);

/** The default window (`WD_JOB_START_WINDOW_SECONDS`). */
const WINDOW_SECONDS = 3600;

function setOrganizationLimit(
  limit: number,
  organizationId: OrganizationId = TEST_ORGANIZATION_ID
) {
  return jobStartLimitsRepo.setForOrganization(db, organizationId, limit);
}

/** A fresh API key of the test actor, so one test's key counters never meet another's. */
async function newKey(limit?: number): Promise<string> {
  const id = `wd480-${randomUUID()}`;
  await seedApiKey(db, { id, ownerId: TEST_ACTOR_ID });
  if (limit !== undefined) {
    await jobStartLimitsRepo.setForKey(db, TEST_ORGANIZATION_ID, id, limit);
  }
  return id;
}

function startDns(
  caseId: CaseId,
  extra: { actorKeyId?: string; organizationId?: OrganizationId } = {}
) {
  return runDomain(
    startJobEffect({
      caseId,
      organizationId: extra.organizationId ?? TEST_ORGANIZATION_ID,
      capabilityId: "network.dns.lookup",
      actorId: TEST_ACTOR_ID,
      actorKeyId: extra.actorKeyId,
      input: { host: "mailhost.test" },
    })
  );
}

function usage(organizationId: OrganizationId, actorKeyId?: string) {
  return runDomain(getJobStartLimitsEffect({ organizationId, actorKeyId }));
}

async function refusalOf(run: Promise<unknown>): Promise<JobStartLimitError> {
  const error = await run.then(
    () => undefined,
    (error: unknown) => error
  );
  if (!(error instanceof JobStartLimitError)) {
    throw new TypeError(`expected a JobStartLimitError, got ${String(error)}`);
  }
  return error;
}

async function jobCount(caseId: CaseId): Promise<number> {
  return (await listCaseJobs(db, caseId)).length;
}

describe("Job start limits", () => {
  beforeEach(async () => {
    await resetTestDb();
    queue.sends.length = 0;
    for (const organizationId of [
      TEST_ORGANIZATION_ID,
      TEST_OTHER_ORGANIZATION_ID,
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- two seeds, one after the other
      await seedOrganizationMember(db, {
        organizationId,
        userId: TEST_ACTOR_ID,
        role: "member",
      });
    }
  });

  it("admits starts up to the organization limit and refuses the next with the stable code", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    await setOrganizationLimit(2);

    await startDns(cased.id);
    await startDns(cased.id);
    const refused = await refusalOf(startDns(cased.id));

    expect(refused).toMatchObject({
      code: "job_start_limited",
      scope: "organization",
      limit: 2,
      windowSeconds: WINDOW_SECONDS,
    });
    expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(WINDOW_SECONDS);
    expect(refused.message).toContain("this organization");
    // The refused start left nothing behind: no Job row, no queue message, no count.
    expect(await jobCount(cased.id)).toBe(2);
    expect(queue.sends).toHaveLength(2);
    expect((await usage(TEST_ORGANIZATION_ID)).organization.used).toBe(2);
  });

  it("a limit of 0 refuses every start", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    await setOrganizationLimit(0);
    const refused = await refusalOf(startDns(cased.id));
    expect(refused).toMatchObject({ scope: "organization", limit: 0 });
    expect(await jobCount(cased.id)).toBe(0);
  });

  it("counts a key's starts against the key and the organization, and a refused key start gives the organization's count back", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const key = await newKey(1);

    await startDns(cased.id, { actorKeyId: key });
    const refused = await refusalOf(startDns(cased.id, { actorKeyId: key }));

    expect(refused).toMatchObject({ scope: "key", limit: 1 });
    expect(refused.message).toContain("this API key");
    const state = await usage(TEST_ORGANIZATION_ID, key);
    expect(state.key).toMatchObject({ used: 1, limit: 1, source: "override" });
    // One admitted start; the refused one rolled the organization's count back with the rest.
    expect(state.organization.used).toBe(1);
    expect(await jobCount(cased.id)).toBe(1);
  });

  it("keeps key limits independent: another key and a session still start", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const exhausted = await newKey(1);
    const other = await newKey();

    await startDns(cased.id, { actorKeyId: exhausted });
    await refusalOf(startDns(cased.id, { actorKeyId: exhausted }));

    await startDns(cased.id, { actorKeyId: other });
    await startDns(cased.id);
    expect(await jobCount(cased.id)).toBe(3);
    expect((await usage(TEST_ORGANIZATION_ID, other)).key?.used).toBe(1);
    // A session has no key limit, only the organization's.
    expect((await usage(TEST_ORGANIZATION_ID)).key).toBeNull();
  });

  it("an organization at its limit refuses its keys too, whatever their own limits", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    await setOrganizationLimit(1);
    const key = await newKey(100);

    await startDns(cased.id);
    const refused = await refusalOf(startDns(cased.id, { actorKeyId: key }));

    expect(refused.scope).toBe("organization");
    expect((await usage(TEST_ORGANIZATION_ID, key)).key?.used).toBe(0);
  });

  it("isolates organizations: counters and overrides never cross", async () => {
    const mine = await seedCase(db, { organizationId: TEST_ORGANIZATION_ID });
    const theirs = await seedCase(db, {
      organizationId: TEST_OTHER_ORGANIZATION_ID,
    });
    await setOrganizationLimit(1, TEST_ORGANIZATION_ID);
    await setOrganizationLimit(3, TEST_OTHER_ORGANIZATION_ID);

    await startDns(mine.id);
    await refusalOf(startDns(mine.id));

    // The other organization's limit and count are its own.
    for (let started = 0; started < 3; started += 1) {
      // oxlint-disable-next-line no-await-in-loop -- sequential on purpose
      await startDns(theirs.id, {
        organizationId: TEST_OTHER_ORGANIZATION_ID,
      });
    }
    const refusedTheirs = await refusalOf(
      startDns(theirs.id, { organizationId: TEST_OTHER_ORGANIZATION_ID })
    );
    expect(refusedTheirs.limit).toBe(3);
    expect((await usage(TEST_ORGANIZATION_ID)).organization).toMatchObject({
      used: 1,
      limit: 1,
    });
    expect(
      (await usage(TEST_OTHER_ORGANIZATION_ID)).organization
    ).toMatchObject({ used: 3, limit: 3 });
  });

  it("admits exactly the limit when starts arrive at once", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    await setOrganizationLimit(3);

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => startDns(cased.id))
    );

    const admitted = results.filter((result) => result.status === "fulfilled");
    const refused = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason as unknown] : []
    );
    expect(admitted).toHaveLength(3);
    expect(refused).toHaveLength(5);
    expect(
      refused.every(
        (error) => error instanceof JobStartLimitError && error.limit === 3
      )
    ).toBe(true);
    expect(await jobCount(cased.id)).toBe(3);
    expect((await usage(TEST_ORGANIZATION_ID)).organization.used).toBe(3);
  });

  describe("every start path counts", () => {
    it("a Cap run (jobs.start)", async () => {
      const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
      await setOrganizationLimit(1);
      await startDns(cased.id);
      await refusalOf(startDns(cased.id));
    });

    it("a retry, which is a new start", async () => {
      const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
      await setOrganizationLimit(2);
      const first = await startDns(cased.id);
      await forceJobStatus(db, first.id, "failed");

      const retried = await runDomain(
        retryJobEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          jobId: first.id,
          actorId: TEST_ACTOR_ID,
        })
      );
      expect(retried.retryOfJobId).toBe(first.id);
      expect((await usage(TEST_ORGANIZATION_ID)).organization.used).toBe(2);

      await forceJobStatus(db, retried.id, "failed");
      await refusalOf(
        runDomain(
          retryJobEffect({
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            jobId: retried.id,
            actorId: TEST_ACTOR_ID,
          })
        )
      );
    });

    it("a Playbook run counts once, as the run", async () => {
      const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
      await setOrganizationLimit(1);
      const started = await runDomain(
        runPlaybookEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          playbookId: "host-footprint",
          actorId: TEST_ACTOR_ID,
          seed: { host: "mailhost.test" },
        })
      );
      expect(started.jobs).toHaveLength(1);
      expect((await usage(TEST_ORGANIZATION_ID)).organization.used).toBe(1);

      const refused = await refusalOf(
        runDomain(
          runPlaybookEffect({
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            playbookId: "host-footprint",
            actorId: TEST_ACTOR_ID,
            seed: { host: "mailhost.test" },
          })
        )
      );
      expect(refused.scope).toBe("organization");
      // The refused run left no run row and no Job.
      expect(await jobCount(cased.id)).toBe(1);
    });

    it("an Evidence verb counts a new Job, and joining an open one counts nothing", async () => {
      const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
      const evidence = await seedEvidence(db, cased.id, { kind: "file" });
      const other = await seedEvidence(db, cased.id, { kind: "file" });
      await setOrganizationLimit(1);
      const process = (evidenceId: string) =>
        runDomain(
          processEvidenceEffect({
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            evidenceId,
            actorId: TEST_ACTOR_ID,
          })
        );

      const first = await process(evidence.id);
      const joined = await process(evidence.id);
      expect(joined.id).toBe(first.id);
      expect((await usage(TEST_ORGANIZATION_ID)).organization.used).toBe(1);

      await refusalOf(process(other.id));
      expect(await jobCount(cased.id)).toBe(1);
    });

    it("a Case export Job counts a new export, and joining the open one counts nothing", async () => {
      const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
      await setOrganizationLimit(1);
      const key = await newKey(5);
      const exportCase = () =>
        runDomain(
          startCaseExportJobEffect({
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            actorId: TEST_ACTOR_ID,
            actorKeyId: key,
          })
        );

      const first = await exportCase();
      const joined = await exportCase();
      expect(first.created).toBe(true);
      expect(joined).toMatchObject({ jobId: first.jobId, created: false });
      const state = await usage(TEST_ORGANIZATION_ID, key);
      expect(state.organization.used).toBe(1);
      expect(state.key?.used).toBe(1);

      // The export used the organization's budget: a Cap run is refused now.
      await refusalOf(startDns(cased.id));
      // And a second export once the first is over is a new start, refused too.
      await forceJobStatus(db, first.jobId, "succeeded");
      await refusalOf(exportCase());
    });
  });

  it("does not hide a refusal behind another error tag", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    await setOrganizationLimit(0);
    const error = await startDns(cased.id).then(
      () => undefined,
      (error: unknown) => error
    );
    expect(isDomainTag(error)).toBe(true);
  });
});

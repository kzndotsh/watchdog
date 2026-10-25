import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { isDomainTag } from "@watchdog/core/errors";
import { Db, runDomainWith } from "@watchdog/core/infra";
import {
  recordingJobQueue,
  runPlaybookEffect,
  startJobEffect,
} from "@watchdog/core/jobs";
import { putCredentialEffect, vaultLayer } from "@watchdog/core/vault";
import { casesRepo, db, jobsRepo } from "@watchdog/db";
import type { CaseId, JsonObject } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  resetActorAccess,
  resetTestDb,
  seedCase,
  seedJob,
  seedOrganizationMember,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { preflightEffect } from "../stages/preflight.ts";

/*
 * Egress classes (#496): a Job whose Cap needs a class its Case does not allow is blocked, at the
 * one availability check start-job, Playbook start and the worker's preflight share. The block
 * names the classes and where the Cap would go.
 */

const queue = recordingJobQueue();
const runDomain = runDomainWith(
  Layer.mergeAll(Layer.provideMerge(vaultLayer, Db.layer), queue.layer)
);

const HOST = "mailhost.test";

function start(caseId: CaseId, capabilityId: string, input: JsonObject) {
  return runDomain(
    startJobEffect({
      caseId,
      organizationId: TEST_ORGANIZATION_ID,
      capabilityId,
      actorId: TEST_ACTOR_ID,
      input,
    })
  );
}

async function refusalOf(attempt: Promise<unknown>) {
  const error = await attempt.then(
    () => null,
    (error_: unknown) => error_
  );
  expect(isDomainTag(error) && error.code).toBe("forbidden");
  return String(isDomainTag(error) && error.message);
}

describe("egress classes block a Job the Case does not allow", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "member",
    });
    await resetActorAccess(db, { userId: TEST_ACTOR_ID, keyId: "egress-key" });
    queue.sends.length = 0;
  });

  describe("start-job", () => {
    it("refuses a public lookup on a new Case, naming the class and the host, and leaves no Job", async () => {
      const cased = await seedCase(db);

      const reason = await refusalOf(
        start(cased.id, "network.ct.lookup", { host: HOST })
      );

      expect(reason).toContain("Public lookups");
      expect(reason).toContain("crt.sh");
      expect(reason).toContain("owner or admin");
      expect(await jobsRepo.listForCase(db, cased.id)).toHaveLength(0);
      expect(queue.sends).toHaveLength(0);
    });

    it("refuses a keyed lookup as an account lookup even with the key stored", async () => {
      const cased = await seedCase(db, { allowedEgress: ["local", "target"] });
      await runDomain(
        putCredentialEffect({
          userId: TEST_ACTOR_ID,
          name: "SHODAN_API_KEY",
          secret: "k-test",
        })
      );

      const reason = await refusalOf(
        start(cased.id, "network.shodan.lookup", { ip: "9.9.9.9" })
      );

      expect(reason).toContain("Account lookups");
      expect(reason).toContain("api.shodan.io");
      expect(await jobsRepo.listForCase(db, cased.id)).toHaveLength(0);
    });

    it("queues a Cap that only reaches the target on a new Case", async () => {
      const cased = await seedCase(db);

      const job = await start(cased.id, "network.dns.lookup", { host: HOST });

      expect(job.status).toBe("queued");
    });

    it("allows one class without the other: a Case can allow crt.sh without Shodan", async () => {
      const cased = await seedCase(db, {
        allowedEgress: ["local", "target", "public_lookup"],
      });
      await runDomain(
        putCredentialEffect({
          userId: TEST_ACTOR_ID,
          name: "SHODAN_API_KEY",
          secret: "k-test",
        })
      );

      const job = await start(cased.id, "network.ct.lookup", { host: HOST });
      expect(job.status).toBe("queued");
      const reason = await refusalOf(
        start(cased.id, "network.shodan.lookup", { ip: "9.9.9.9" })
      );
      expect(reason).toContain("Account lookups");
      expect(reason).not.toContain("Public lookups");
    });

    it("names every blocked class of a Cap that needs several", async () => {
      const cased = await seedCase(db, { allowedEgress: ["local"] });

      const reason = await refusalOf(
        start(cased.id, "network.url.enrich", { url: `https://${HOST}/page` })
      );

      expect(reason).toContain("The target itself, Public lookups");
      expect(reason).toContain("web.archive.org");
    });
  });

  describe("Playbook start", () => {
    it("refuses a Playbook with a step the Case does not allow before it writes a run", async () => {
      const cased = await seedCase(db);

      const reason = await refusalOf(
        runDomain(
          runPlaybookEffect({
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            playbookId: "host-enumerate",
            actorId: TEST_ACTOR_ID,
            actorLabel: TEST_ACTOR_ID,
            seed: { host: HOST },
          })
        )
      );

      expect(reason).toContain("network.ct.lookup");
      expect(reason).toContain("crt.sh");
      expect(await jobsRepo.listForCase(db, cased.id)).toHaveLength(0);
    });

    it("starts it once the Case allows the class", async () => {
      const cased = await seedCase(db, {
        allowedEgress: ["local", "target", "public_lookup"],
      });

      const result = await runDomain(
        runPlaybookEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          playbookId: "host-enumerate",
          actorId: TEST_ACTOR_ID,
          actorLabel: TEST_ACTOR_ID,
          seed: { host: HOST },
        })
      );

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0]?.capabilityId).toBe("network.ct.lookup");
    });
  });

  describe("the worker's preflight", () => {
    it("fails an already-queued Job whose Case does not allow its class, without claiming it", async () => {
      const cased = await seedCase(db);
      const job = await seedJob(db, cased.id, {
        status: "queued",
        capabilityId: "network.ct.lookup",
        input: { host: HOST },
      });

      const result = await runDomain(preflightEffect(job.id));

      expect(result).toEqual({ kind: "stop", reason: "egress_denied" });
      const row = await jobsRepo.get(db, job.id);
      expect(row?.status).toBe("failed");
      expect(row?.error).toContain("Public lookups");
      expect(row?.error).toContain("crt.sh");
      expect(row?.startedAt).toBeNull();
    });

    it("runs the same Job once the Case allows the class", async () => {
      const cased = await seedCase(db, {
        allowedEgress: ["local", "target", "public_lookup"],
      });
      const job = await seedJob(db, cased.id, {
        status: "queued",
        capabilityId: "network.ct.lookup",
        input: { host: HOST },
      });

      const result = await runDomain(preflightEffect(job.id));

      expect(result.kind).toBe("ready");
      expect((await jobsRepo.get(db, job.id))?.status).toBe("running");
    });

    it("blocks a Job when the Case changed after it was queued", async () => {
      const cased = await seedCase(db, {
        allowedEgress: ["local", "target", "public_lookup"],
      });
      const job = await seedJob(db, cased.id, {
        status: "queued",
        capabilityId: "network.ct.lookup",
        input: { host: HOST },
      });
      // State setup, not the owner-or-admin rule: written straight through the repo.
      await casesRepo.update(db, cased.id, cased.organizationId, {
        allowedEgress: ["local", "target"],
      });

      const result = await runDomain(preflightEffect(job.id));

      expect(result).toEqual({ kind: "stop", reason: "egress_denied" });
    });
  });
});

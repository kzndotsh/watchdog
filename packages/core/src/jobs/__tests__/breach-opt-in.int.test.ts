import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireCapability } from "@watchdog/caps";
import { isDomainTag } from "@watchdog/core/errors";
import { Db, runDomainWith } from "@watchdog/core/infra";
import {
  recordingJobQueue,
  runPlaybookEffect,
  startJobEffect,
} from "@watchdog/core/jobs";
import { putCredentialEffect, vaultLayer } from "@watchdog/core/vault";
import { db, jobsRepo, playbookRunsRepo } from "@watchdog/db";
import { EGRESS_CLASSES } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  resetActorAccess,
  resetTestDb,
  seedCase,
  seedJob,
  seedOrganizationMember,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { outboundClientLayer } from "@watchdog/tools/http";

import { recordingBlobStore } from "../../infra/blob-store.ts";
import { evaluateCapAvailabilityEffect } from "../cap-availability.ts";
import { JobFibers } from "../job-fibers.ts";
import { executeJobOnMap } from "../run-job.ts";
import { preflightEffect } from "../stages/preflight.ts";

/** What `env.WD_BREACH_CAPS` reads: the real `breachCapsMode` runs against it. */
const setting = vi.hoisted(() => ({
  mode: "off" as "off" | "safe" | "full",
}));

vi.mock("@watchdog/env/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/env/server")>();
  return {
    ...actual,
    env: new Proxy(actual.env, {
      get: (target, prop, receiver) =>
        prop === "WD_BREACH_CAPS"
          ? setting.mode
          : Reflect.get(target, prop, receiver),
    }),
  };
});

const queue = recordingJobQueue();
const services = Layer.mergeAll(
  Layer.provideMerge(vaultLayer, Db.layer),
  recordingBlobStore().layer,
  outboundClientLayer,
  queue.layer,
  JobFibers.layer
);
const runDomain = runDomainWith(services);

const EMAIL = "someone@mailhost.test";

const BREACH_KEYS = [
  "HIBP_API_KEY",
  "HUDSONROCK_API_KEY",
  "DEHASHED_API_KEY",
  "SNUSBASE_API_KEY",
  "LEAKRADAR_API_KEY",
];

async function storeBreachKeys() {
  await Promise.all(
    BREACH_KEYS.map((name) =>
      runDomain(
        putCredentialEffect({ userId: TEST_ACTOR_ID, name, secret: "k-test" })
      )
    )
  );
}

describe("breach Caps are opt-in (WD_BREACH_CAPS)", () => {
  beforeEach(async () => {
    setting.mode = "off";
    await resetTestDb();
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "member",
    });
    await resetActorAccess(db, { userId: TEST_ACTOR_ID, keyId: "br313-key" });
    queue.sends.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("availability", () => {
    it("reports breach_disabled even with the key stored and egress allowed", async () => {
      const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
      await storeBreachKeys();
      const { result } = await runDomain(
        evaluateCapAvailabilityEffect({
          actorId: TEST_ACTOR_ID,
          caseId: cased.id,
          cap: requireCapability("breach.hibp.lookup"),
        })
      );
      expect(result).toEqual({
        ok: false,
        kind: "breach_disabled",
        capabilityId: "breach.hibp.lookup",
      });
    });

    it("is available once the setting is on", async () => {
      setting.mode = "safe";
      const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
      await storeBreachKeys();
      const { result } = await runDomain(
        evaluateCapAvailabilityEffect({
          actorId: TEST_ACTOR_ID,
          caseId: cased.id,
          cap: requireCapability("breach.hibp.lookup"),
        })
      );
      expect(result).toEqual({ ok: true });
    });

    it("does not touch a Cap outside the breach category", async () => {
      const cased = await seedCase(db);
      const { result } = await runDomain(
        evaluateCapAvailabilityEffect({
          actorId: TEST_ACTOR_ID,
          caseId: cased.id,
          cap: requireCapability("network.dns.lookup"),
        })
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe("start-job", () => {
    it.each([
      ["breach.hibp.lookup", { email: EMAIL }],
      ["breach.hudsonrock.lookup", { query: EMAIL }],
      ["breach.dehashed.lookup", { query: EMAIL }],
      ["breach.snusbase.lookup", { query: EMAIL }],
      ["breach.leakradar.lookup", { query: EMAIL }],
    ])("refuses to queue %s and leaves no Job behind", async (id, input) => {
      const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
      await storeBreachKeys();
      const error = await runDomain(
        startJobEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          capabilityId: id,
          actorId: TEST_ACTOR_ID,
          input,
        })
      ).then(
        () => null,
        (error: unknown) => error
      );
      expect(isDomainTag(error) && error.code).toBe("forbidden");
      expect(String(isDomainTag(error) && error.message)).toMatch(
        /WD_BREACH_CAPS/
      );
      expect(await jobsRepo.listForCase(db, cased.id)).toHaveLength(0);
      expect(queue.sends).toHaveLength(0);
    });

    it("queues the Cap once the setting is on", async () => {
      setting.mode = "safe";
      const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
      await storeBreachKeys();
      const job = await runDomain(
        startJobEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          capabilityId: "breach.hibp.lookup",
          actorId: TEST_ACTOR_ID,
          input: { email: EMAIL },
        })
      );
      expect(job.status).toBe("queued");
      expect(queue.sends).toHaveLength(1);
    });
  });

  describe("preflight and the worker", () => {
    it("ends an already-queued breach Job as preflight_failed, without claiming it", async () => {
      const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
      await storeBreachKeys();
      const job = await seedJob(db, cased.id, {
        status: "queued",
        capabilityId: "breach.hibp.lookup",
        input: { email: EMAIL },
      });

      const result = await runDomain(preflightEffect(job.id));

      expect(result).toEqual({ kind: "stop", reason: "breach_disabled" });
      const row = await jobsRepo.get(db, job.id);
      expect(row?.status).toBe("failed");
      expect(row?.errorCode).toBe("preflight_failed");
      expect(row?.error).toMatch(/WD_BREACH_CAPS/);
      expect(row?.startedAt).toBeNull();
    });

    it("lets the same Job through preflight once the setting is on", async () => {
      setting.mode = "safe";
      const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
      await storeBreachKeys();
      const job = await seedJob(db, cased.id, {
        status: "queued",
        capabilityId: "breach.hibp.lookup",
        input: { email: EMAIL },
      });
      const result = await runDomain(preflightEffect(job.id));
      expect(result.kind).toBe("ready");
    });

    it("the worker's run settles a queued breach Job failed and never calls the provider", async () => {
      const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
      await storeBreachKeys();
      const job = await seedJob(db, cased.id, {
        status: "queued",
        capabilityId: "breach.dehashed.lookup",
        input: { query: EMAIL },
      });
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const outcome = await Effect.runPromise(
        executeJobOnMap(job.id).pipe(Effect.provide(services), Effect.scoped)
      );

      expect(outcome.outcome).toBe("failed");
      const row = await jobsRepo.get(db, job.id);
      expect(row?.status).toBe("failed");
      expect(row?.errorCode).toBe("preflight_failed");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("Playbooks", () => {
    it.each(["email-breach", "email-corpus"])(
      "%s cannot start and writes no run or Job",
      async (playbookId) => {
        const cased = await seedCase(db, {
          allowedEgress: [...EGRESS_CLASSES],
        });
        await storeBreachKeys();
        const error = await runDomain(
          runPlaybookEffect({
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            playbookId,
            actorId: TEST_ACTOR_ID,
            seed: { email: EMAIL },
          })
        ).then(
          () => null,
          (error: unknown) => error
        );
        expect(isDomainTag(error) && error.code).toBe("forbidden");
        expect(String(isDomainTag(error) && error.message)).toMatch(
          /WD_BREACH_CAPS/
        );
        expect(await jobsRepo.listForCase(db, cased.id)).toHaveLength(0);
        expect(await playbookRunsRepo.listRunning(db)).toHaveLength(0);
      }
    );

    it("email-breach starts once the setting is on", async () => {
      setting.mode = "safe";
      const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
      await storeBreachKeys();
      const result = await runDomain(
        runPlaybookEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          playbookId: "email-breach",
          actorId: TEST_ACTOR_ID,
          seed: { email: EMAIL },
        })
      );
      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0]?.capabilityId).toBe("breach.hibp.lookup");
    });
  });
});

import { createHash } from "node:crypto";

import { Effect, Layer } from "effect";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db, jobsRepo, providerCallsRepo } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  resetActorAccess,
  resetTestDb,
  seedCase,
  seedEvidence,
  seedJob,
  seedOrganizationMember,
  seedProviderCall,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { outboundClientLayer } from "@watchdog/tools/http";

import { requireBreachCredentialOptInEffect } from "../../export/breach-credential-opt-in";
import { caseExportObjectKey } from "../../export/export-objects";
import { warmObjectStore } from "../../infra/__tests__/helpers/object-store-ready";
import {
  blobStoreLayer,
  deleteCaseArtifactsEffect,
  readArtifactBytesEffect,
} from "../../infra/blob";
import { Db } from "../../infra/db-service";
import { vaultLayer } from "../../infra/vault";
import { caseExportLinkEffect, startCaseExportJobEffect } from "../export-job";
import { JobFibers } from "../job-fibers";
import { recordingJobQueue } from "../job-queue";
import { executeJobEffect } from "../run-job";

/*
 * The per-Export opt-in for raw provider responses on the export Job path (#499): only a
 * signed-in owner or admin asks for it, the flag travels in the Job's input to the worker, and
 * an open export with other options is never joined.
 */

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

const OWNER = TEST_ACTOR_ID;
const MEMBER = "opt-in-job-member";
const KEY_ID = "wd499-key";

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

const seeded: CaseId[] = [];
let caseId: CaseId;
let slug: string;

function start(opts: {
  actorId: string;
  actorKeyId?: string;
  shouldIncludeRawBodies?: boolean;
  shouldIncludeBreachCredentials?: boolean;
}) {
  return program(
    startCaseExportJobEffect({
      caseId,
      organizationId: TEST_ORGANIZATION_ID,
      ...opts,
    })
  );
}

async function archiveOf(jobId: string) {
  const bytes = await program(
    readArtifactBytesEffect(caseExportObjectKey(caseId, jobId))
  );
  const files = unzipSync(bytes);
  const jsonl = files[`${slug}/provider-calls.jsonl`];
  if (jsonl === undefined) throw new Error("no provider-calls.jsonl");
  return strFromU8(jsonl)
    .split("\n")
    .filter((line) => line !== "")
    .map(
      (line) =>
        JSON.parse(line) as { rawBody: { status: string; reason?: string } }
    );
}

beforeEach(async () => {
  setting.mode = "full";
  await resetTestDb();
  queue.sends.length = 0;
  for (const [userId, role] of [
    [OWNER, "owner"],
    [MEMBER, "member"],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one member row per role
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId,
      role,
    });
  }
  await resetActorAccess(db, { userId: OWNER, keyId: KEY_ID });
  const cased = await seedCase(db, { name: "Opt-in export" });
  caseId = cased.id;
  slug = cased.slug;
  seeded.push(caseId);
  // A stored body behind one call; the real register withholds it either way, and the reason
  // says whether the opt-in reached the worker.
  const evidence = await seedEvidence(db, caseId, { text: "a" });
  const job = await seedJob(db, caseId, {
    status: "succeeded",
    capabilityId: "threat.abuseipdb.lookup",
  });
  const sha256 = createHash("sha256").update("body").digest("hex");
  const call = await seedProviderCall(db, caseId, job.id, {
    url: "https://api.abuseipdb.com/api/v2/check?key=[redacted]",
    outcome: {
      bodyState: "stored",
      bodyReason: null,
      bodySha256: sha256,
      bodyBytes: 4,
      blobKey: `${caseId}/${sha256}/provider-response`,
    },
  });
  await providerCallsRepo.linkEvidence(db, caseId, [evidence.id], [call.id]);
});

warmObjectStore();

describe("raw-body opt-in on the export Job path", () => {
  afterEach(async () => {
    for (const id of seeded.splice(0)) {
      // oxlint-disable-next-line no-await-in-loop -- one Case's objects at a time
      await program(deleteCaseArtifactsEffect(id));
    }
  });

  it("refuses a member and an API key, and starts no Job", async () => {
    await expect(
      start({ actorId: MEMBER, shouldIncludeRawBodies: true })
    ).rejects.toMatchObject({ _tag: "ForbiddenError" });
    // A key acts as its owner, yet never opts in.
    await expect(
      start({
        actorId: OWNER,
        actorKeyId: KEY_ID,
        shouldIncludeRawBodies: true,
      })
    ).rejects.toMatchObject({ _tag: "ForbiddenError" });

    expect(
      await jobsRepo.listActiveForCapability(db, caseId, "system.case_export")
    ).toHaveLength(0);
    expect(queue.sends).toHaveLength(0);
    // A member may still ask for the plain export.
    await expect(start({ actorId: MEMBER })).resolves.toMatchObject({
      created: true,
    });
  });

  it("carries the owner's opt-in in the Job input to the worker; without it the export asks for none", async () => {
    const opted = await start({ actorId: OWNER, shouldIncludeRawBodies: true });
    expect((await jobsRepo.get(db, opted.jobId))?.input).toEqual({
      shouldIncludeRawBodies: true,
      shouldIncludeBreachCredentials: false,
    });
    await program(executeJobEffect(opted.jobId));
    // Asked for, and the real register records AbuseIPDB as forbidding it: withheld for that reason.
    expect((await archiveOf(opted.jobId)).map((e) => e.rawBody)).toEqual([
      {
        status: "withheld",
        reason: "redistribution_forbidden",
        explanation: expect.any(String),
      },
    ]);

    const plain = await start({ actorId: OWNER });
    await program(executeJobEffect(plain.jobId));
    expect((await archiveOf(plain.jobId)).map((e) => e.rawBody.reason)).toEqual(
      ["not_opted_in"]
    );
  }, 60_000);

  it("refuses breach credentials to a member and an API key, and in safe mode, and starts no Job", async () => {
    await expect(
      start({ actorId: MEMBER, shouldIncludeBreachCredentials: true })
    ).rejects.toMatchObject({ _tag: "ForbiddenError" });
    await expect(
      start({
        actorId: OWNER,
        actorKeyId: KEY_ID,
        shouldIncludeBreachCredentials: true,
      })
    ).rejects.toMatchObject({ _tag: "ForbiddenError" });
    // Safe mode keeps no credentials: the opt-in is refused, not ignored.
    for (const mode of ["safe", "off"] as const) {
      setting.mode = mode;
      // oxlint-disable-next-line no-await-in-loop -- one mode at a time
      await expect(
        start({ actorId: OWNER, shouldIncludeBreachCredentials: true })
      ).rejects.toMatchObject({
        _tag: "InvalidError",
        reason: expect.stringContaining("WD_BREACH_CAPS=full"),
      });
    }
    expect(
      await jobsRepo.listActiveForCapability(db, caseId, "system.case_export")
    ).toHaveLength(0);
    expect(queue.sends).toHaveLength(0);
  });

  it("carries the owner's breach-credential opt-in in full mode, and never joins an export with other options", async () => {
    const opted = await start({
      actorId: OWNER,
      shouldIncludeBreachCredentials: true,
    });
    expect((await jobsRepo.get(db, opted.jobId))?.input).toEqual({
      shouldIncludeRawBodies: false,
      shouldIncludeBreachCredentials: true,
    });
    // The plain export (and a member's) must not be answered by the opted-in one, nor the reverse.
    await expect(start({ actorId: MEMBER })).rejects.toMatchObject({
      _tag: "ConflictError",
    });
    await expect(
      start({ actorId: OWNER, shouldIncludeRawBodies: true })
    ).rejects.toMatchObject({ _tag: "ConflictError" });
    await expect(
      start({ actorId: OWNER, shouldIncludeBreachCredentials: true })
    ).resolves.toMatchObject({ jobId: opted.jobId, created: false });
    await program(executeJobEffect(opted.jobId));
    const plain = await start({ actorId: OWNER });
    expect(plain.created).toBe(true);
    await expect(
      start({ actorId: OWNER, shouldIncludeBreachCredentials: true })
    ).rejects.toMatchObject({ _tag: "ConflictError" });
  }, 60_000);

  it("signs the download of an archive with breach credentials for an owner only, never a member or an API key", async () => {
    const opted = await start({
      actorId: OWNER,
      shouldIncludeBreachCredentials: true,
    });
    await program(executeJobEffect(opted.jobId));
    const link = (who: { actorId: string; viaApiKey: boolean }) =>
      program(
        caseExportLinkEffect({
          caseId,
          organizationId: TEST_ORGANIZATION_ID,
          jobId: opted.jobId,
          ...who,
        })
      );
    await expect(
      link({ actorId: MEMBER, viaApiKey: false })
    ).rejects.toMatchObject({ _tag: "ForbiddenError" });
    // A key acts as its owner, yet never fetches an archive that holds credentials.
    await expect(
      link({ actorId: OWNER, viaApiKey: true })
    ).rejects.toMatchObject({ _tag: "ForbiddenError" });
    await expect(
      link({ actorId: OWNER, viaApiKey: false })
    ).resolves.toMatchObject({ kind: "ready" });

    // The same people fetch an ordinary archive.
    const plain = await start({ actorId: OWNER });
    await program(executeJobEffect(plain.jobId));
    for (const who of [
      { actorId: MEMBER, viaApiKey: false },
      { actorId: OWNER, viaApiKey: true },
      { actorId: OWNER, viaApiKey: false },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one caller at a time
      await expect(
        program(
          caseExportLinkEffect({
            caseId,
            organizationId: TEST_ORGANIZATION_ID,
            jobId: plain.jobId,
            ...who,
          })
        )
      ).resolves.toMatchObject({ kind: "ready" });
    }
  }, 60_000);

  it("reads the mode when the opt-in check runs, not when it is built", async () => {
    setting.mode = "safe";
    const check = requireBreachCredentialOptInEffect({
      organizationId: TEST_ORGANIZATION_ID,
      actorId: OWNER,
      viaApiKey: false,
    });
    setting.mode = "full";
    await expect(program(check)).resolves.toBeUndefined();
    setting.mode = "safe";
    await expect(program(check)).rejects.toMatchObject({
      _tag: "InvalidError",
    });
  });

  it("joins an open export with the same options and refuses to join one with other options", async () => {
    const plain = await start({ actorId: OWNER });
    await expect(start({ actorId: MEMBER })).resolves.toMatchObject({
      jobId: plain.jobId,
      created: false,
    });
    // The owner's opted-in request must not be answered by the plain export, nor the reverse.
    await expect(
      start({ actorId: OWNER, shouldIncludeRawBodies: true })
    ).rejects.toMatchObject({ _tag: "ConflictError" });
    expect(queue.sends).toHaveLength(1);

    await program(executeJobEffect(plain.jobId));
    const opted = await start({ actorId: OWNER, shouldIncludeRawBodies: true });
    expect(opted.created).toBe(true);
    // A member cannot ride on the owner's open opted-in export.
    await expect(start({ actorId: MEMBER })).rejects.toMatchObject({
      _tag: "ConflictError",
    });
    await expect(
      start({ actorId: OWNER, shouldIncludeRawBodies: true })
    ).resolves.toMatchObject({ jobId: opted.jobId, created: false });
  }, 60_000);
});

import { Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteCaseEffect, purgeCaseEffect } from "@watchdog/core/cases";
import {
  caseDeletionRecordsRepo,
  casesRepo,
  db,
  jobsRepo,
  providerCallsRepo,
} from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  listCaseEvidence,
  resetTestDb,
  seedCase,
  seedOrganizationMember,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { recordingBlobStore } from "../../infra/blob-store";
import { Db } from "../../infra/db-service";
import { runDomainWith } from "../../infra/run-domain";
import {
  capCacheKey,
  lookupCapCacheEffect,
  storeCapCacheEffect,
} from "../cap-cache";
import { createJobLog } from "../job-log";
import { recordingJobQueue } from "../job-queue";
import { storeCacheStageEffect } from "../stages/cache";
import { collectEffect } from "../stages/collect";
import { landEvidenceEffect } from "../stages/land-evidence";
import {
  collectLayer,
  fakeCap,
  getText,
  respondWith,
  runningState,
  startProvider,
  type LoopbackProvider,
} from "./helpers/provider-calls-harness";

// The Job's request must open a real connection to the loopback provider.
vi.unmock("undici");

const providers: LoopbackProvider[] = [];
afterEach(async () => {
  await Promise.all(providers.splice(0).map(async (p) => p.close()));
});

const store = recordingBlobStore();
const layer = collectLayer(store);
const run = runDomainWith(layer);

function collect(state: Awaited<ReturnType<typeof runningState>>) {
  return run(
    collectEffect(state, createJobLog(), new AbortController().signal)
  );
}

async function cachedCap(caseId: CaseId) {
  const host = await startProvider({
    "/v1/host": respondWith('{"ok":true}'),
  });
  providers.push(host);
  const cap = fakeCap(
    "test.cached",
    caseId,
    getText(`${host.origin}/v1/host`),
    {
      jobPolicy: { cacheTtlMs: 60_000 },
    }
  );
  return { host, cap };
}

/** Runs the source Job and files its result in the Case's cache, as the finish of a Job does. */
async function runSource(
  caseId: CaseId,
  cap: Awaited<ReturnType<typeof cachedCap>>["cap"],
  options: { landEvidence: boolean }
) {
  const state = await runningState(caseId, cap);
  const collected = await collect(state);
  if (options.landEvidence) {
    await run(landEvidenceEffect(state, collected));
  }
  const key = capCacheKey(cap, state.policy, state.input);
  if (key === null) throw new Error("the Cap is cacheable");
  await run(
    storeCapCacheEffect({
      caseId,
      capabilityId: cap.id,
      inputHash: key.inputHash,
      capVersion: state.capVersion,
      jobId: state.jobId,
      artifacts: collected.artifacts,
      resultSummary: null,
      ttlMs: key.ttlMs,
    })
  );
  return { state, collected };
}

describe("Evidence from a cache hit", () => {
  let caseId: CaseId;

  beforeEach(async () => {
    await resetTestDb();
    store.objects.clear();
    caseId = (await seedCase(db)).id;
  });

  it("reuses the source Job's Evidence, which is already linked to that run's calls, and records the source", async () => {
    const { host, cap } = await cachedCap(caseId);
    const source = await runSource(caseId, cap, { landEvidence: true });
    const sourceJob = await jobsRepo.get(db, source.state.jobId);
    const reused = sourceJob?.evidenceIds ?? [];
    expect(reused).toHaveLength(1);

    const hitState = await runningState(caseId, cap);
    const hit = await collect(hitState);
    const landed = await run(landEvidenceEffect(hitState, hit));

    // No second call went out; the Job points at the run it reused.
    expect(host.hits()).toEqual(["/v1/host"]);
    expect(
      await providerCallsRepo.listForJob(db, caseId, hitState.jobId)
    ).toEqual([]);
    expect(hit).toMatchObject({
      fromCache: true,
      cacheSourceJobId: source.state.jobId,
    });
    expect((await jobsRepo.get(db, hitState.jobId))?.cacheSourceJobId).toBe(
      source.state.jobId
    );
    expect(landed).toEqual(reused);
    const behind = await providerCallsRepo.listForEvidence(
      db,
      caseId,
      reused[0] ?? ""
    );
    expect(behind.map((row) => row.call.id)).toEqual(
      source.collected.providerCallIds
    );
  });

  it("links Evidence the hit lands anew to the source run's calls", async () => {
    const { host, cap } = await cachedCap(caseId);
    // The source landed no Evidence (it was removed, say), so the hit lands from the artifacts.
    const source = await runSource(caseId, cap, { landEvidence: false });

    const hitState = await runningState(caseId, cap);
    const hit = await collect(hitState);
    expect(hit).toMatchObject({ fromCache: true, evidenceIds: [] });
    const landed = await run(landEvidenceEffect(hitState, hit));

    expect(host.hits()).toEqual(["/v1/host"]);
    expect(landed).toHaveLength(1);
    expect(await listCaseEvidence(db, caseId)).toHaveLength(1);
    const behind = await providerCallsRepo.listForEvidence(
      db,
      caseId,
      landed[0] ?? ""
    );
    expect(
      behind.map((row) => ({ id: row.call.id, job: row.call.jobId }))
    ).toEqual(
      source.collected.providerCallIds.map((id) => ({
        id,
        job: source.state.jobId,
      }))
    );
    expect((await jobsRepo.get(db, hitState.jobId))?.cacheSourceJobId).toBe(
      source.state.jobId
    );
  });
});

describe("a reclaimed cache hit", () => {
  it("stays a hit, so the replacement does not file its result in the cache as a run of its own", async () => {
    await resetTestDb();
    store.objects.clear();
    const caseId = (await seedCase(db)).id;
    const { cap } = await cachedCap(caseId);
    const source = await runSource(caseId, cap, { landEvidence: true });

    // The dead worker had stamped the hit and stored its output; the replacement reclaims it.
    const hitState = await runningState(caseId, cap);
    await run(
      collectEffect(hitState, createJobLog(), new AbortController().signal)
    );
    const stamped = await jobsRepo.get(db, hitState.jobId);
    if (stamped === null) throw new Error("job missing");
    const reclaiming = await runningState(caseId, cap);
    const replacement = {
      ...reclaiming,
      job: { ...reclaiming.job, cacheSourceJobId: source.state.jobId },
      reclaimArtifacts: stamped.output ?? [],
      reclaimEvidenceIds: stamped.evidenceIds,
    };
    const collected = await collect(replacement);

    expect(collected).toMatchObject({
      reclaim: true,
      fromCache: true,
      cacheSourceJobId: source.state.jobId,
    });
    await run(
      storeCacheStageEffect({
        state: replacement,
        runtime: collected.runtime,
        artifacts: collected.artifacts,
        resultSummary: null,
        fromCache: collected.fromCache,
        interpretError: null,
      })
    );
    const key = capCacheKey(cap, replacement.policy, replacement.input);
    const hit = await run(
      lookupCapCacheEffect({
        caseId,
        capabilityId: cap.id,
        inputHash: key?.inputHash ?? "",
        capVersion: replacement.capVersion,
      })
    );
    expect(hit?.jobId).toBe(source.state.jobId);
  });
});

describe("purging a Case with provider calls", () => {
  beforeEach(async () => {
    await resetTestDb();
    store.objects.clear();
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "owner",
    });
  });

  it("erases the calls, their Evidence links and raw bodies, and counts them in the deletion record", async () => {
    const cased = await seedCase(db, { slug: "doomed" });
    const keeper = await seedCase(db, { slug: "keeper" });
    const doomed = await cachedCap(cased.id);
    const kept = await cachedCap(keeper.id);
    const first = await runSource(cased.id, doomed.cap, { landEvidence: true });
    const second = await runSource(keeper.id, kept.cap, { landEvidence: true });
    const bodyObjects = (id: CaseId) =>
      [...store.objects.keys()].filter(
        (key) => key.startsWith(`${id}/`) && key.endsWith("/provider-response")
      );
    expect(bodyObjects(cased.id)).toHaveLength(1);
    expect(bodyObjects(keeper.id)).toHaveLength(1);
    const owner = {
      organizationId: TEST_ORGANIZATION_ID,
      actorId: TEST_ACTOR_ID,
    };
    const queue = recordingJobQueue();
    const admin = runDomainWith(
      Layer.mergeAll(Db.layer, store.layer, queue.layer)
    );

    await admin(deleteCaseEffect(cased.id, owner));
    await admin(purgeCaseEffect(cased.id, owner));

    expect(await casesRepo.getByIdUnchecked(db, cased.id)).toBeNull();
    expect(
      await providerCallsRepo.listForJob(db, cased.id, first.state.jobId)
    ).toEqual([]);
    const evidenceBehind = await providerCallsRepo.listForEvidence(
      db,
      cased.id,
      (await jobsRepo.get(db, first.state.jobId))?.evidenceIds[0] ?? ""
    );
    expect(evidenceBehind).toEqual([]);
    // The raw body went with the Case; the other Case's stays, with its calls.
    expect(bodyObjects(cased.id)).toEqual([]);
    expect(bodyObjects(keeper.id)).toHaveLength(1);
    expect(
      await providerCallsRepo.listForJob(db, keeper.id, second.state.jobId)
    ).toHaveLength(1);

    const records = await caseDeletionRecordsRepo.listForCase(db, cased.id);
    expect(records.at(-1)?.event).toBe("purged");
    expect(records.at(-1)?.counts).toMatchObject({
      providerCalls: 1,
      providerCallOutcomes: 1,
      evidenceProviderCalls: 1,
      providerRawBodies: 1,
    });
  });
});

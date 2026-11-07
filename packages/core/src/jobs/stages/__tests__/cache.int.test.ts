import { beforeEach, describe, expect, it } from "vitest";

import { requireCapability } from "@watchdog/caps";
import { runDomain } from "@watchdog/core/infra";
import { db, type JobArtifact } from "@watchdog/db";
import { resetTestDb, seedCase, seedJob } from "@watchdog/test-db";

import { lookupCapCacheEffect } from "../../cap-cache";
import { createJobLog } from "../../job-log";
import { storeCacheStageEffect } from "../cache";
import type { PreflightState } from "../preflight";

const CAP_ID = "network.dns.lookup";
const CAP_VERSION = "v1";
const INPUT_HASH = "hash-cache-stage";
const TTL_MS = 60_000;

const REPORT: JobArtifact = {
  name: "report.json",
  mime: "application/json",
  uri: "s3://evidence/report.json",
  sha256: "a".repeat(64),
};

async function seedState(): Promise<PreflightState> {
  const cased = await seedCase(db);
  const job = await seedJob(db, cased.id, { capabilityId: CAP_ID });
  const cap = requireCapability(CAP_ID);
  return {
    jobId: job.id,
    job,
    capVersion: CAP_VERSION,
    cap,
    policy: cap.jobPolicy ?? {},
    input: { host: "mailhost.test" },
    reclaimArtifacts: null,
    reclaimEvidenceIds: [],
  };
}

function store(
  state: PreflightState,
  over: {
    cacheTtlMs?: number | null;
    fromCache?: boolean;
    interpretError?: string | null;
    artifacts?: JobArtifact[];
  } = {}
) {
  const jobLog = createJobLog();
  return runDomain(
    storeCacheStageEffect({
      state,
      runtime: {
        cacheTtlMs: over.cacheTtlMs === undefined ? TTL_MS : over.cacheTtlMs,
        inputHash: INPUT_HASH,
        jobLog,
      },
      artifacts: over.artifacts ?? [REPORT],
      resultSummary: "done",
      fromCache: over.fromCache ?? false,
      interpretError: over.interpretError ?? null,
    })
  );
}

function lookup(state: PreflightState) {
  return runDomain(
    lookupCapCacheEffect({
      caseId: state.job.caseId,
      capabilityId: CAP_ID,
      inputHash: INPUT_HASH,
      capVersion: CAP_VERSION,
    })
  );
}

describe("storeCacheStageEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("stores a fresh successful run so the next lookup hits it", async () => {
    const state = await seedState();
    await store(state);
    const hit = await lookup(state);
    expect(hit).toMatchObject({
      jobId: state.jobId,
      resultSummary: "done",
      artifacts: [REPORT],
    });
  });

  it.each([
    ["caching is disabled", { cacheTtlMs: null }],
    ["the result came from the cache", { fromCache: true }],
    ["interpret failed", { interpretError: "bad report" }],
    [
      "an interpreting Cap produced no report.json",
      { artifacts: [{ ...REPORT, name: "dns-x.json" }] },
    ],
  ])("stores nothing when %s", async (_name, over) => {
    const state = await seedState();
    await store(state, over);
    expect(await lookup(state)).toBeNull();
  });
});

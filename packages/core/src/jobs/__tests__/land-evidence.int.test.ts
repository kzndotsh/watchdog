import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { requireCapability } from "@watchdog/caps";
import { db, evidenceRepo, jobsRepo } from "@watchdog/db";
import { resetTestDb, seedCase, seedJob } from "@watchdog/test-kit/db";

import type { CollectResult } from "../stages/collect.ts";
import { createJobLog } from "../stages/helpers.ts";
import { landEvidenceEffect } from "../stages/land-evidence.ts";
import type { PreflightState } from "../stages/preflight.ts";

function sha(): string {
  return "cd".repeat(32);
}

async function stateFor(jobId: string): Promise<PreflightState> {
  const job = await jobsRepo.get(db, jobId);
  if (!job) throw new Error("job missing");
  const cap = requireCapability("network.dns.lookup");
  return {
    jobId,
    job,
    cap,
    policy: cap.jobPolicy ?? {},
    input: { host: "example.com" },
    allowThirdPartyEgress: false,
    reclaimArtifacts: null,
    reclaimEvidenceIds: [],
  };
}

function collected(overrides: Partial<CollectResult> = {}): CollectResult {
  const jobLog = createJobLog();
  return {
    artifacts: [
      {
        name: "snapshot.html",
        mime: "text/html",
        uri: "case/snap.html",
        sha256: sha(),
      },
      {
        name: "report.json",
        mime: "application/json",
        uri: "case/report.json",
        sha256: sha(),
      },
    ],
    evidenceIds: [],
    fromCache: false,
    reclaim: false,
    runtime: {
      scratchDir: "/tmp",
      signal: new AbortController().signal,
      jobLog,
      evidenceSnapshot: undefined,
      linkedSource: undefined,
      cacheTtlMs: null,
      inputHash: null,
    },
    ...overrides,
  };
}

describe("landEvidence", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("lands non-internal artifacts and skips report.json", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "running" });
    const result = collected();

    const ids = await Effect.runPromise(
      landEvidenceEffect(await stateFor(job.id), result)
    );

    expect(ids).toHaveLength(1);
    const rows = await evidenceRepo.listForCase(db, cased.id);
    expect(rows.some((row) => row.label === "snapshot.html")).toBe(true);
    expect(rows.some((row) => row.label === "report.json")).toBe(false);

    const updated = await jobsRepo.get(db, job.id);
    expect(updated?.evidenceIds).toEqual(ids);
  });

  it("is a no-op for reclaim", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "running" });
    const existing = ["11111111-1111-4111-8111-000000000099"];
    const result = collected({
      reclaim: true,
      evidenceIds: existing,
    });

    const ids = await Effect.runPromise(
      landEvidenceEffect(await stateFor(job.id), result)
    );
    expect(ids).toEqual(existing);

    const rows = await evidenceRepo.listForCase(db, cased.id);
    expect(rows).toHaveLength(0);
  });

  it("lands cached artifacts when the source Job has no evidenceIds", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "running" });
    const result = collected({
      fromCache: true,
      evidenceIds: [],
    });

    const ids = await Effect.runPromise(
      landEvidenceEffect(await stateFor(job.id), result)
    );

    expect(ids).toHaveLength(1);
    const rows = await evidenceRepo.listForCase(db, cased.id);
    expect(rows.some((row) => row.label === "snapshot.html")).toBe(true);

    const updated = await jobsRepo.get(db, job.id);
    expect(updated?.evidenceIds).toEqual(ids);
  });

  it("is a no-op for cache hits", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "running" });
    const existing = ["11111111-1111-4111-8111-000000000098"];
    const result = collected({
      fromCache: true,
      evidenceIds: existing,
    });

    const ids = await Effect.runPromise(
      landEvidenceEffect(await stateFor(job.id), result)
    );
    expect(ids).toEqual(existing);

    const rows = await evidenceRepo.listForCase(db, cased.id);
    expect(rows).toHaveLength(0);
  });
});

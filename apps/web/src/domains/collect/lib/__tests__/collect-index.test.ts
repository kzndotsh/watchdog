import { describe, expect, it } from "vitest";

import {
  buildCollectIndex,
  collectIndexOptionsFromPlaybooks,
} from "@/domains/collect/lib/collect-index";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/types";
import { testId } from "@watchdog/test-kit";

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: testId(40),
    caseId: testId(10),
    entityId: null,
    kind: "attestation",
    label: "carrier-lookup.txt",
    notes: null,
    mime: "text/plain",
    uri: null,
    sha256: null,
    text: "hello world",
    sourceUrl: null,
    actorId: "test-actor",
    actorLabel: "test-actor",
    capturedAt: "2026-01-02T00:00:00.000Z",
    processedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function job(overrides: Partial<JobListRecord> = {}): JobListRecord {
  const row: JobListRecord = {
    id: testId(11),
    caseId: testId(10),
    capabilityId: "network.dns.lookup",
    status: "succeeded",
    input: { host: "example.com" },
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
    startedAt: "2026-01-03T00:00:01.000Z",
    finishedAt: "2026-01-03T00:00:02.000Z",
    error: null,
    interpretError: null,
    proposalId: null,
    resultSummary: null,
    fromCache: false,
    suppressedCount: 0,
    playbookRunId: null,
    playbookId: null,
    playbookRunStatus: null,
    playbookStep: null,
    evidenceIds: [],
    output: [],
    actorId: "test-actor",
    actorLabel: "test-actor",
    playbookFanIndex: 0,
    ...overrides,
  };
  if (overrides.createdAt !== undefined && overrides.updatedAt === undefined) {
    row.updatedAt = overrides.createdAt;
  }
  return row;
}

describe("buildCollectIndex", () => {
  it("builds a hand dump row with no producing Cap", () => {
    const paste = evidence({ id: testId(40), label: "carrier-lookup.txt" });
    const index = buildCollectIndex([paste], []);

    expect(index.rows).toHaveLength(1);
    expect(index.rows[0]).toMatchObject({
      id: paste.id,
      title: "carrier-lookup.txt",
      state: "unprocessed",
      evidence: paste,
      runs: [],
    });
    expect(index.rowById(paste.id)?.id).toBe(paste.id);
    expect(index.titleForEvidence(paste.id)).toBe("carrier-lookup.txt");
  });

  it("keeps an in-flight Cap as its own row until Evidence lands", () => {
    const running = job({
      id: testId(12),
      status: "running",
      evidenceIds: [],
      createdAt: "2026-01-04T00:00:00.000Z",
    });
    const index = buildCollectIndex([], [running]);

    expect(index.rows).toHaveLength(1);
    expect(index.rows[0]).toMatchObject({
      id: running.id,
      state: "running",
      evidence: null,
      runs: [{ job: running, role: "collect" }],
    });
    expect(index.rowById(running.id)?.id).toBe(running.id);
  });

  it("trims padded entityId on standalone job rows", () => {
    const entityId = testId(99);
    const running = job({
      id: testId(12),
      status: "running",
      evidenceIds: [],
      input: { host: "example.com", entityId: `  ${entityId}  ` },
      createdAt: "2026-01-04T00:00:00.000Z",
    });
    const index = buildCollectIndex([], [running]);
    expect(index.rows[0]?.entityId).toBe(entityId);
  });

  it("collapses a landed Cap into the Evidence row and keeps rowById(jobId)", () => {
    const landedEvidence = evidence({
      id: testId(41),
      label: "example.com",
      capturedAt: "2026-01-05T00:00:00.000Z",
    });
    const collectJob = job({
      id: testId(13),
      evidenceIds: [landedEvidence.id],
      createdAt: "2026-01-05T00:00:00.000Z",
    });
    const index = buildCollectIndex([landedEvidence], [collectJob]);

    expect(index.rows).toHaveLength(1);
    expect(index.rows[0]?.id).toBe(landedEvidence.id);
    expect(index.rows[0]?.runs).toEqual([
      expect.objectContaining({ job: collectJob, role: "collect" }),
    ]);
    expect(index.rowById(collectJob.id)?.id).toBe(landedEvidence.id);
    expect(index.rowById(landedEvidence.id)?.id).toBe(landedEvidence.id);
  });

  it("attaches enrich and process runs without forking the Evidence row", () => {
    const row = evidence({ id: testId(42), label: "https://example.com" });
    const collectJob = job({
      id: testId(14),
      evidenceIds: [row.id],
      createdAt: "2026-01-06T00:00:00.000Z",
      updatedAt: "2026-01-06T00:00:00.000Z",
    });
    const enrichJob = job({
      id: testId(15),
      capabilityId: "network.url.enrich",
      input: { sourceEvidenceId: row.id },
      createdAt: "2026-01-06T00:00:01.000Z",
      updatedAt: "2026-01-06T00:00:01.000Z",
    });
    const processJob = job({
      id: testId(16),
      capabilityId: "evidence.harvest",
      evidenceIds: [row.id],
      createdAt: "2026-01-06T00:00:02.000Z",
      updatedAt: "2026-01-06T00:00:02.000Z",
    });
    const index = buildCollectIndex([row], [collectJob, enrichJob, processJob]);

    expect(index.rows).toHaveLength(1);
    expect(index.rows[0]?.runs.map((run) => run.role)).toEqual([
      "process",
      "enrich",
      "collect",
    ]);
  });

  it("clusters playbook steps into one acquisition row", () => {
    const runId = testId(90);
    const step1 = job({
      id: testId(17),
      playbookRunId: runId,
      playbookId: "domain-sweep",
      playbookStep: 1,
      status: "succeeded",
      createdAt: "2026-01-07T00:00:00.000Z",
      updatedAt: "2026-01-07T00:00:00.000Z",
    });
    const step2 = job({
      id: testId(18),
      playbookRunId: runId,
      playbookId: "domain-sweep",
      playbookStep: 2,
      status: "running",
      createdAt: "2026-01-07T00:00:01.000Z",
      updatedAt: "2026-01-07T00:00:01.000Z",
    });
    const index = buildCollectIndex([], [step1, step2], {
      recipeStepsByPlaybookId: new Map([["domain-sweep", 5]]),
    });

    expect(index.rows).toHaveLength(1);
    expect(index.rows[0]).toMatchObject({
      id: runId,
      playbookRunId: runId,
      evidence: null,
      state: "running",
    });
    expect(index.rows[0]?.runs).toHaveLength(2);
    expect(index.rowById(step2.id)?.id).toBe(runId);
    expect(index.rows[0]?.recipe).toEqual({ step: 2, total: 5 });
    expect(index.rows[0]?.title).toBe("Domain Sweep");
    expect(index.rows[0]?.hint).toBe("Step 3 · DNS Lookup — example.com");
  });

  it("orders playbook rows by latest step activity, not step-0 createdAt", () => {
    const runId = testId(93);
    const step0 = job({
      id: testId(24),
      playbookRunId: runId,
      playbookId: "domain-sweep",
      playbookStep: 0,
      status: "succeeded",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const step1 = job({
      id: testId(25),
      playbookRunId: runId,
      playbookId: "domain-sweep",
      playbookStep: 1,
      status: "running",
      createdAt: "2026-01-01T00:00:01.000Z",
      updatedAt: "2026-01-08T12:00:00.000Z",
    });
    const staleSolo = job({
      id: testId(26),
      status: "succeeded",
      createdAt: "2026-01-05T00:00:00.000Z",
      updatedAt: "2026-01-05T00:00:00.000Z",
    });
    const index = buildCollectIndex([], [step0, step1, staleSolo]);

    expect(index.rows[0]?.id).toBe(runId);
    expect(index.rows[0]?.when).toBe("2026-01-08T12:00:00.000Z");
  });

  it("orders solo job rows by updatedAt when it is newer than createdAt", () => {
    const older = job({
      id: testId(27),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const bumped = job({
      id: testId(28),
      status: "running",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-09T00:00:00.000Z",
    });
    const index = buildCollectIndex([], [older, bumped]);

    expect(index.rows[0]?.id).toBe(bumped.id);
    expect(index.rows[0]?.when).toBe("2026-01-09T00:00:00.000Z");
  });

  it("titles solo collect jobs from referenced evidence label", () => {
    const source = evidence({ id: testId(47), label: "Vendor Report PDF" });
    const solo = job({
      id: testId(48),
      capabilityId: "network.shodan.lookup",
      input: { evidenceId: source.id },
      status: "running",
      evidenceIds: [],
    });
    const index = buildCollectIndex([source], [solo]);
    expect(index.rows.find((row) => row.id === solo.id)?.title).toBe(
      "Shodan Lookup — Vendor Report PDF"
    );
  });

  it("titles solo jobs from entityTitleById when input references entityId", () => {
    const entityId = testId(51);
    const solo = job({
      id: testId(52),
      capabilityId: "network.shodan.lookup",
      input: { entityId },
      status: "running",
      evidenceIds: [],
    });
    const index = buildCollectIndex([], [solo], {
      entityTitleById: new Map([[entityId, "Acme Corp"]]),
    });
    expect(index.rows.find((row) => row.id === solo.id)?.title).toBe(
      "Shodan Lookup — Acme Corp"
    );
  });

  it("titles solo jobs from evidenceTitleById when source row is not indexed", () => {
    const hiddenId = testId(49);
    const solo = job({
      id: testId(50),
      capabilityId: "evidence.harvest",
      input: { evidenceId: hiddenId },
      status: "running",
      evidenceIds: [],
    });
    const index = buildCollectIndex([], [solo], {
      evidenceTitleById: new Map([[hiddenId, "Hidden dump"]]),
    });
    expect(index.rows.find((row) => row.id === solo.id)?.title).toBe(
      "Harvest — Hidden dump"
    );
    expect(index.titleForEvidence(hiddenId)).toBe("Hidden dump");
  });

  it("prefers catalog playbook titles when provided", () => {
    const runId = testId(92);
    const step = job({
      id: testId(23),
      playbookRunId: runId,
      playbookId: "domain-sweep",
      playbookStep: 1,
      status: "running",
    });
    const index = buildCollectIndex([], [step], {
      playbookTitleById: new Map([["domain-sweep", "Domain footprint"]]),
    });
    expect(index.rows[0]?.title).toBe("Domain footprint");
  });

  it("shows full recipe progress when a playbook run is finished", () => {
    const runId = testId(91);
    const step1 = job({
      id: testId(21),
      playbookRunId: runId,
      playbookId: "domain-sweep",
      playbookStep: 1,
      playbookRunStatus: "finished",
      status: "succeeded",
      createdAt: "2026-01-07T00:00:00.000Z",
    });
    const step2 = job({
      id: testId(22),
      playbookRunId: runId,
      playbookId: "domain-sweep",
      playbookStep: 2,
      playbookRunStatus: "finished",
      status: "succeeded",
      createdAt: "2026-01-07T00:00:01.000Z",
    });
    const index = buildCollectIndex([], [step1, step2], {
      recipeStepsByPlaybookId: new Map([["domain-sweep", 5]]),
    });

    expect(index.rows[0]?.recipe).toEqual({ step: 5, total: 5 });
  });

  it("keeps a parent run row when a harvest lands multiple Evidence rows", () => {
    const e1 = evidence({ id: testId(43), label: "hit-1" });
    const e2 = evidence({ id: testId(44), label: "hit-2" });
    const harvest = job({
      id: testId(19),
      capabilityId: "evidence.harvest",
      evidenceIds: [e1.id, e2.id],
      createdAt: "2026-01-08T00:00:00.000Z",
    });
    const index = buildCollectIndex([e1, e2], [harvest]);

    expect(index.rows.some((row) => row.id === harvest.id)).toBe(true);
    expect(index.rowById(harvest.id)?.runs[0]?.job.id).toBe(harvest.id);
  });

  it("marks blocked Cap-only rows as blocked, not queued", () => {
    const blocked = job({
      id: testId(15),
      status: "blocked",
      evidenceIds: [],
      createdAt: "2026-01-04T02:00:00.000Z",
    });
    const index = buildCollectIndex([], [blocked]);

    expect(index.rows[0]?.state).toBe("blocked");
  });

  it("marks cancelled Cap-only rows as cancelled, not failed", () => {
    const cancelled = job({
      id: testId(14),
      status: "cancelled",
      evidenceIds: [],
      createdAt: "2026-01-04T01:00:00.000Z",
    });
    const index = buildCollectIndex([], [cancelled]);

    expect(index.rows).toHaveLength(1);
    expect(index.rows[0]).toMatchObject({
      id: cancelled.id,
      state: "cancelled",
      evidence: null,
    });
  });

  it("marks processed Evidence as landed", () => {
    const processed = evidence({
      id: testId(46),
      processedAt: "2026-01-10T00:00:00.000Z",
    });
    const index = buildCollectIndex([processed], []);

    expect(index.rows[0]?.state).toBe("landed");
  });

  it("marks hidden Evidence without dropping an active process run from the row", () => {
    const hidden = evidence({
      id: testId(45),
      deletedAt: "2026-01-09T00:00:00.000Z",
    });
    const processJob = job({
      id: testId(20),
      capabilityId: "evidence.harvest",
      status: "running",
      input: { evidenceId: hidden.id },
      createdAt: "2026-01-09T00:00:00.000Z",
    });
    const index = buildCollectIndex([hidden], [processJob]);

    expect(index.rows).toHaveLength(1);
    expect(index.rows[0]).toMatchObject({
      id: hidden.id,
      state: "hidden",
      runs: [expect.objectContaining({ job: processJob, role: "process" })],
    });
  });
});

describe("collectIndexOptionsFromPlaybooks", () => {
  it("maps catalog ids to titles and step counts", () => {
    const opts = collectIndexOptionsFromPlaybooks([
      { id: "host-footprint", title: "Host Footprint", steps: [{}, {}] },
    ]);
    expect(opts.playbookTitleById?.get("host-footprint")).toBe(
      "Host Footprint"
    );
    expect(opts.recipeStepsByPlaybookId?.get("host-footprint")).toBe(2);
  });
});

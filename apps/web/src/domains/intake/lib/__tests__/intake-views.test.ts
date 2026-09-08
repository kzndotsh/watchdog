import { describe, expect, it } from "vitest";

import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/types";
import { testId } from "@watchdog/test-kit";

import {
  collectRowForEvidence,
  jobsForRole,
  producingCapFromRow,
  producingCollectJob,
  rowHint,
  rowState,
  rowTitle,
} from "../evidence-runs.ts";
import {
  evidenceHasEnrichableUrl,
  evidenceHint,
  evidenceTitle,
  evidenceTitleMapFromRecords,
  latestEnrichOutput,
  ENRICHED_MD_ARTIFACT,
} from "../evidence.ts";

const ENRICHABLE_SOURCE = ["https", "://mailhost.test/"].join("");

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: testId(40),
    caseId: testId(10),
    entityId: null,
    kind: "attestation",
    label: "note",
    notes: null,
    mime: "text/plain",
    uri: null,
    sha256: null,
    text: "hello",
    sourceUrl: null,
    actorId: "test-actor",
    actorLabel: "test-actor",
    capturedAt: "2026-01-01T00:00:00.000Z",
    processedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("intake evidence helpers", () => {
  function job(overrides: Partial<JobListRecord> = {}): JobListRecord {
    return {
      id: testId(11),
      caseId: testId(10),
      capabilityId: "network.dns.lookup",
      status: "succeeded",
      input: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
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
  }

  it("titles from label and detects enrichable URLs", () => {
    expect(evidenceTitle(evidence())).toBe("note");
    expect(evidenceTitle(evidence({ label: null }))).toBe("Attestation");
    expect(
      evidenceHasEnrichableUrl(evidence({ sourceUrl: ENRICHABLE_SOURCE }))
    ).toBe(true);
    expect(producingCapFromRow(null)).toBeNull();
  });

  it("evidenceTitleMapFromRecords indexes active and hidden rows", () => {
    const active = evidence({ id: testId(41), label: "active.txt" });
    const hidden = evidence({ id: testId(42), label: "hidden.txt" });
    const map = evidenceTitleMapFromRecords([active, hidden]);
    expect(map.get(active.id)).toBe("active.txt");
    expect(map.get(hidden.id)).toBe("hidden.txt");
  });

  it("producingCollectJob prefers the most recently active collect cap", () => {
    const evidenceId = testId(40);
    const older = job({
      id: testId(12),
      evidenceIds: [evidenceId],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = job({
      id: testId(13),
      evidenceIds: [evidenceId],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(producingCollectJob([older, newer], evidenceId)?.id).toBe(
      testId(13)
    );
  });

  it("producingCollectJob matches padded whitespace evidenceIds", () => {
    const evidenceId = testId(40);
    const padded = job({
      evidenceIds: [`  ${evidenceId}  `],
    });
    expect(producingCollectJob([padded], evidenceId)?.id).toBe(padded.id);
  });

  it("producingCapFromRow uses producingCollectJob for evidence rows", () => {
    const row = evidence({ id: testId(40) });
    const older = job({
      id: testId(12),
      evidenceIds: [row.id],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = job({
      id: testId(13),
      evidenceIds: [row.id],
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    const collectRow = collectRowForEvidence(row, [older, newer]);
    expect(producingCapFromRow(collectRow)?.id).toBe(testId(13));
  });

  it("groups process and enrich jobs for an evidence row", () => {
    const row = evidence({ id: testId(40) });
    const processJob = job({
      id: testId(12),
      capabilityId: "evidence.harvest",
      evidenceIds: [row.id],
    });
    const enrichJob = job({
      id: testId(13),
      capabilityId: "network.url.enrich",
      input: { sourceEvidenceId: row.id },
      output: [
        {
          name: ENRICHED_MD_ARTIFACT,
          sha256: "abc",
          mime: "text/markdown",
          uri: "s3://bucket/enriched.md",
        },
      ],
      status: "succeeded",
    });
    const collectRow = collectRowForEvidence(row, [processJob, enrichJob]);

    expect(jobsForRole(collectRow, "process")).toEqual([processJob]);
    expect(jobsForRole(collectRow, "enrich")).toEqual([enrichJob]);
    expect(latestEnrichOutput([enrichJob])).toEqual({
      job: enrichJob,
      artifact: enrichJob.output![0],
    });
    expect(evidenceHint(row, null)).toBe("5 characters");
  });

  it("latestEnrichOutput returns null while enrich is blocked", () => {
    const blockedEnrich = job({
      capabilityId: "network.url.enrich",
      status: "blocked",
      input: { sourceEvidenceId: testId(40) },
      output: [],
      error: "Missing credential",
    });
    expect(latestEnrichOutput([blockedEnrich])).toBeNull();
  });

  it("rowState distinguishes blocked caps from queued caps", () => {
    const blocked = job({ status: "blocked", evidenceIds: [] });
    const queued = job({ id: testId(16), status: "queued", evidenceIds: [] });
    expect(rowState(null, [{ job: blocked, role: "collect" }])).toBe("blocked");
    expect(rowState(null, [{ job: queued, role: "collect" }])).toBe("queued");
  });

  it("rowState prefers blocked when a row has both queued and blocked runs", () => {
    const queued = job({ id: testId(17), status: "queued", evidenceIds: [] });
    const blocked = job({ id: testId(18), status: "blocked", evidenceIds: [] });
    expect(
      rowState(null, [
        { job: queued, role: "collect" },
        { job: blocked, role: "collect" },
      ])
    ).toBe("blocked");
  });

  it("rowState distinguishes cancelled caps from failed caps", () => {
    const cancelled = job({ status: "cancelled", evidenceIds: [] });
    const failed = job({ id: testId(15), status: "failed", evidenceIds: [] });
    expect(rowState(null, [{ job: cancelled, role: "collect" }])).toBe(
      "cancelled"
    );
    expect(rowState(null, [{ job: failed, role: "collect" }])).toBe("failed");
  });

  it("rowTitle includes ip seed for solo collect jobs", () => {
    expect(
      rowTitle(
        null,
        job({
          capabilityId: "network.shodan.lookup",
          input: { ip: "198.51.100.1" },
        })
      )
    ).toBe("Shodan Lookup — 198.51.100.1");
  });

  it("rowTitle resolves evidence title for process jobs referencing evidenceId", () => {
    const evidenceId = testId(44);
    const titles = new Map([[evidenceId, "Vendor Report PDF"]]);
    expect(
      rowTitle(
        null,
        job({
          capabilityId: "evidence.harvest",
          input: { evidenceId },
        }),
        { evidenceTitleById: titles }
      )
    ).toBe("Harvest — Vendor Report PDF");
  });

  it("rowTitle resolves entity title for jobs referencing entityId", () => {
    const entityId = testId(46);
    const titles = new Map([[entityId, "Acme Corp"]]);
    expect(
      rowTitle(
        null,
        job({
          capabilityId: "network.shodan.lookup",
          input: { entityId },
        }),
        { entityTitleById: titles }
      )
    ).toBe("Shodan Lookup — Acme Corp");
  });

  it("rowHint shows evidence title in playbook step hint", () => {
    const evidenceId = testId(45);
    const titles = new Map([[evidenceId, "Vendor Report PDF"]]);
    const playbookJob = job({
      playbookRunId: testId(12),
      playbookId: "host-footprint",
      playbookStep: 0,
      capabilityId: "evidence.harvest",
      input: { evidenceId },
    });
    expect(
      rowHint(null, [{ job: playbookJob, role: "step" }], playbookJob, {
        evidenceTitleById: titles,
      })
    ).toBe("Step 1 · Harvest — Vendor Report PDF");
  });

  it("rowHint prefers playbook label for evidence from playbook runs", () => {
    const row = evidence({ text: "long body content" });
    const playbookJob = job({
      playbookRunId: testId(12),
      playbookId: "host-footprint",
      playbookStep: 0,
      evidenceIds: [row.id],
    });
    expect(rowHint(row, [{ job: playbookJob, role: "step" }], null)).toBe(
      "Host Footprint"
    );
  });

  it("rowHint shows active playbook step for job-only rows", () => {
    const playbookJob = job({
      playbookRunId: testId(12),
      playbookId: "host-footprint",
      playbookStep: 1,
      capabilityId: "network.dns.lookup",
      input: { host: "example.com" },
    });
    expect(
      rowHint(null, [{ job: playbookJob, role: "step" }], playbookJob)
    ).toBe("Step 2 · DNS Lookup — example.com");
  });

  it("evidenceHint prefers playbook label for playbook-producing jobs", () => {
    expect(
      evidenceHint(
        evidence(),
        job({
          playbookRunId: testId(12),
          playbookId: "host-footprint",
          playbookStep: 0,
        })
      )
    ).toBe("Host Footprint");
  });
});

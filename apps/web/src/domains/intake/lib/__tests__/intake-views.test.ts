import { describe, expect, it } from "vitest";

import {
  buildCollectIndex,
  jobsForRole,
  producingCapFromRow,
} from "@/domains/collect/lib/collect-index";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import { testId } from "@watchdog/test-kit";

import {
  evidenceHasEnrichableUrl,
  evidenceHint,
  evidenceTitle,
  latestEnrichOutput,
  ENRICHED_MD_ARTIFACT,
} from "../evidence.ts";
import {
  EMPTY_INTAKE_FILTERS,
  filterIntakeQueue,
  intakeFiltersActive,
} from "../filters.ts";

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

describe("intake filters", () => {
  it("filters unattached unprocessed rows", () => {
    expect(intakeFiltersActive(EMPTY_INTAKE_FILTERS)).toBe(false);
    const attached = evidence({
      id: testId(41),
      entityId: testId(20),
      processedAt: "2026-01-02T00:00:00.000Z",
    });
    const open = evidence();
    const filtered = filterIntakeQueue([attached, open], {
      q: "",
      unprocessedOnly: true,
      unattachedOnly: true,
      hiddenOnly: false,
    });
    expect(filtered.map((row) => row.id)).toEqual([open.id]);
  });
});

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
    expect(
      evidenceHasEnrichableUrl(evidence({ sourceUrl: ENRICHABLE_SOURCE }))
    ).toBe(true);
    expect(
      producingCapFromRow(buildCollectIndex([], []).rowById(testId(40)))
    ).toBeNull();
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
    const collectRow = buildCollectIndex(
      [row],
      [processJob, enrichJob]
    ).rowById(row.id);

    expect(jobsForRole(collectRow, "process")).toEqual([processJob]);
    expect(jobsForRole(collectRow, "enrich")).toEqual([enrichJob]);
    expect(latestEnrichOutput([enrichJob])).toEqual({
      job: enrichJob,
      artifact: enrichJob.output![0],
    });
    expect(evidenceHint(row, null)).toBe("5 characters");
  });
});

import { describe, expect, it } from "vitest";

import { filterCollectRows } from "@/domains/collect/lib/collect-filters";
import type { CollectRow } from "@/domains/collect/types";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import { testId } from "@watchdog/test-kit";

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: testId(40),
    caseId: testId(10),
    entityId: null,
    kind: "attestation",
    label: "note.txt",
    notes: null,
    mime: "text/plain",
    uri: null,
    sha256: null,
    text: "hello",
    sourceUrl: null,
    actorId: "test-actor",
    capturedAt: "2026-01-02T00:00:00.000Z",
    processedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function job(overrides: Partial<JobListRecord> = {}): JobListRecord {
  return {
    id: testId(11),
    caseId: testId(10),
    capabilityId: "network.dns.lookup",
    status: "running",
    input: { host: "example.com" },
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
    startedAt: "2026-01-03T00:00:01.000Z",
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
    playbookFanIndex: 0,
    ...overrides,
  };
}

function row(overrides: Partial<CollectRow> = {}): CollectRow {
  const evidenceRow = evidence();
  return {
    id: evidenceRow.id,
    title: evidenceRow.label ?? evidenceRow.id,
    hint: null,
    state: "unprocessed",
    when: evidenceRow.capturedAt,
    entityId: evidenceRow.entityId,
    evidence: evidenceRow,
    runs: [],
    playbookRunId: null,
    recipe: null,
    ...overrides,
  };
}

describe("filterCollectRows", () => {
  const rows = [
    row({
      id: testId(1),
      title: "unprocessed unattached",
      state: "unprocessed",
      evidence: evidence({ id: testId(1), entityId: null, processedAt: null }),
      entityId: null,
    }),
    row({
      id: testId(2),
      title: "processed attached",
      state: "landed",
      evidence: evidence({
        id: testId(2),
        entityId: testId(20),
        processedAt: "2026-01-04T00:00:00.000Z",
      }),
      entityId: testId(20),
    }),
    row({
      id: testId(3),
      title: "running cap",
      state: "running",
      evidence: null,
      runs: [{ job: job({ id: testId(12) }), role: "collect" }],
    }),
  ];

  it("filters unprocessed evidence rows", () => {
    const out = filterCollectRows(rows, {
      q: "",
      states: [],
      hiddenOnly: false,
      unprocessedOnly: true,
      unattachedOnly: false,
      capabilityIds: [],
    });
    expect(out.map((item) => item.id)).toEqual([testId(1)]);
  });

  it("filters unattached evidence rows", () => {
    const out = filterCollectRows(rows, {
      q: "",
      states: [],
      hiddenOnly: false,
      unprocessedOnly: false,
      unattachedOnly: true,
      capabilityIds: [],
    });
    expect(out.map((item) => item.id)).toEqual([testId(1)]);
  });

  it("filters by derived state facets", () => {
    const out = filterCollectRows(rows, {
      q: "",
      states: ["running"],
      hiddenOnly: false,
      unprocessedOnly: false,
      unattachedOnly: false,
      capabilityIds: [],
    });
    expect(out.map((item) => item.id)).toEqual([testId(3)]);
  });

  it("filters by capability id on attached runs", () => {
    const out = filterCollectRows(rows, {
      q: "",
      states: [],
      hiddenOnly: false,
      unprocessedOnly: false,
      unattachedOnly: false,
      capabilityIds: ["network.dns.lookup"],
    });
    expect(out.map((item) => item.id)).toEqual([testId(3)]);
  });
});

import { describe, expect, it } from "vitest";

import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/types";
import type { ProposalRecord } from "@/domains/triage/triage.functions";
import { testId } from "@watchdog/test-kit";

import {
  buildCaseOverviewActivity,
  jobEntityLabelsForActivity,
  jobEvidenceLabelsForActivity,
} from "../overview-activity.ts";

describe("buildCaseOverviewActivity", () => {
  it("labels evidence without user label using kind label", () => {
    const evidence: EvidenceRecord = {
      id: testId(42),
      caseId: testId(10),
      entityId: null,
      kind: "attestation",
      label: null,
      notes: null,
      mime: "text/plain",
      uri: null,
      sha256: null,
      text: null,
      sourceUrl: null,
      actorId: "test-actor",
      actorLabel: "test-actor",
      capturedAt: "2026-01-01T00:00:00.000Z",
      processedAt: null,
      deletedAt: null,
    };
    const items = buildCaseOverviewActivity([evidence], [], []);
    expect(items[0]?.label).toBe("Attestation");
  });

  it("sorts newest first and caps the list", () => {
    const evidence: EvidenceRecord = {
      id: testId(40),
      caseId: testId(10),
      entityId: null,
      kind: "attestation",
      label: "old",
      notes: null,
      mime: "text/plain",
      uri: null,
      sha256: null,
      text: null,
      sourceUrl: null,
      actorId: "test-actor",
      actorLabel: "test-actor",
      capturedAt: "2026-01-01T00:00:00.000Z",
      processedAt: null,
      deletedAt: null,
    };
    const job: JobListRecord = {
      id: testId(11),
      caseId: testId(10),
      capabilityId: "network.dns.lookup",
      status: "succeeded",
      input: {},
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      error: null,
      interpretError: null,
      proposalId: null,
      resultSummary: "dns",
      fromCache: false,
      suppressedCount: 0,
      playbookRunId: null,
      playbookId: null,
      playbookRunStatus: null,
      playbookStep: null,
      playbookFanIndex: 0,
      evidenceIds: [],
      output: [],
      actorId: "test-actor",
      actorLabel: "test-actor",
    };
    const pending: ProposalRecord = {
      id: testId(50),
      caseId: testId(10),
      jobId: null,
      capabilityId: null,
      playbookId: null,
      status: "pending",
      patch: [],
      summary: "pending",
      suppressedCount: 0,
      evidenceIds: [],
      rejectReason: null,
      decidedBy: null,
      decidedByLabel: null,
      decidedAt: null,
      createdAt: "2026-01-02T00:00:00.000Z",
      agentSourced: false,
      userOverridden: false,
      createdBy: null,
      createdByLabel: null,
    };
    const extra: EvidenceRecord = {
      ...evidence,
      id: testId(41),
      label: "newest",
      capturedAt: "2026-01-04T00:00:00.000Z",
    };
    const items = buildCaseOverviewActivity(
      [evidence, extra],
      [job],
      [pending],
      3
    );
    expect(items.map((row) => row.kind)).toEqual([
      "evidence",
      "job",
      "proposal",
    ]);
    expect(items[0]?.label).toBe("newest");
    expect(items).toHaveLength(3);
  });

  it("labels jobs without resultSummary using cap title and input hint", () => {
    const job: JobListRecord = {
      id: testId(12),
      caseId: testId(10),
      capabilityId: "network.shodan.lookup",
      status: "running",
      input: { ip: "198.51.100.1" },
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
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
      playbookFanIndex: 0,
      evidenceIds: [],
      output: [],
      actorId: "test-actor",
      actorLabel: "test-actor",
    };
    const items = buildCaseOverviewActivity([], [job], []);
    expect(items[0]?.label).toBe("Shodan Lookup — 198.51.100.1");
  });

  it("labels jobs referencing evidence by evidence title", () => {
    const evidenceId = testId(43);
    const evidence: EvidenceRecord = {
      id: evidenceId,
      caseId: testId(10),
      entityId: null,
      kind: "attestation",
      label: "Vendor Report PDF",
      notes: null,
      mime: "text/plain",
      uri: null,
      sha256: null,
      text: null,
      sourceUrl: null,
      actorId: "test-actor",
      actorLabel: "test-actor",
      capturedAt: "2026-01-01T00:00:00.000Z",
      processedAt: null,
      deletedAt: null,
    };
    const job: JobListRecord = {
      id: testId(12),
      caseId: testId(10),
      capabilityId: "network.shodan.lookup",
      status: "running",
      input: { evidenceId },
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
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
      playbookFanIndex: 0,
      evidenceIds: [],
      output: [],
      actorId: "test-actor",
      actorLabel: "test-actor",
    };
    const items = buildCaseOverviewActivity([evidence], [job], []);
    expect(items.find((row) => row.kind === "job")?.label).toBe(
      "Shodan Lookup — Vendor Report PDF"
    );
  });

  it("labels jobs referencing entity by entity display name", () => {
    const entityId = testId(47);
    const job: JobListRecord = {
      id: testId(12),
      caseId: testId(10),
      capabilityId: "network.shodan.lookup",
      status: "running",
      input: { entityId },
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
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
      playbookFanIndex: 0,
      evidenceIds: [],
      output: [],
      actorId: "test-actor",
      actorLabel: "test-actor",
    };
    const items = buildCaseOverviewActivity([], [job], [], undefined, [], {
      [entityId]: "Acme Corp",
    });
    expect(items[0]?.label).toBe("Shodan Lookup — Acme Corp");
  });

  it("resolves job labels from hidden evidence rows without listing them", () => {
    const evidenceId = testId(43);
    const hidden: EvidenceRecord = {
      id: evidenceId,
      caseId: testId(10),
      entityId: null,
      kind: "file",
      label: "Hidden dump",
      notes: null,
      mime: "text/plain",
      uri: null,
      sha256: null,
      text: null,
      sourceUrl: null,
      actorId: "test-actor",
      actorLabel: "test-actor",
      capturedAt: "2026-01-02T00:00:00.000Z",
      processedAt: null,
      deletedAt: "2026-01-02T00:00:00.000Z",
    };
    const job: JobListRecord = {
      id: testId(44),
      caseId: testId(10),
      capabilityId: "evidence.harvest",
      status: "running",
      input: { evidenceId },
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
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
      playbookFanIndex: 0,
      evidenceIds: [],
      output: [],
      actorId: "test-actor",
      actorLabel: "test-actor",
    };
    const items = buildCaseOverviewActivity([], [job], [], undefined, [hidden]);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("job");
    expect(items[0]?.label).toBe("Harvest — Hidden dump");
  });

  it("collapses playbook steps into one activity row", () => {
    const runId = testId(14);
    const steps: JobListRecord[] = [0, 1, 2].map((step) => ({
      id: testId(20 + step),
      caseId: testId(10),
      capabilityId: "network.dns.lookup",
      status: step === 2 ? "running" : "succeeded",
      input: { host: "example.com" },
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: `2026-01-03T00:0${step}:00.000Z`,
      startedAt: null,
      finishedAt: null,
      error: null,
      interpretError: null,
      proposalId: null,
      resultSummary: step === 1 ? "dns ok" : null,
      fromCache: false,
      suppressedCount: 0,
      playbookRunId: runId,
      playbookId: "host-footprint-lite",
      playbookRunStatus: "running",
      playbookStep: step,
      playbookFanIndex: 0,
      evidenceIds: [],
      output: [],
      actorId: "test-actor",
      actorLabel: "test-actor",
    }));
    const items = buildCaseOverviewActivity([], steps, []);
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("Host Footprint Lite — dns ok");
    expect(items[0]?.href).toEqual({
      to: "/collect",
      search: { id: runId },
    });
  });

  it("labels playbook jobs with playbook title and seed subject", () => {
    const job: JobListRecord = {
      id: testId(13),
      caseId: testId(10),
      capabilityId: "network.dns.lookup",
      status: "running",
      input: { host: "example.com" },
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      error: null,
      interpretError: null,
      proposalId: null,
      resultSummary: null,
      fromCache: false,
      suppressedCount: 0,
      playbookRunId: testId(14),
      playbookId: "host-footprint-lite",
      playbookRunStatus: "running",
      playbookStep: 0,
      playbookFanIndex: 0,
      evidenceIds: [],
      output: [],
      actorId: "test-actor",
      actorLabel: "test-actor",
    };
    const items = buildCaseOverviewActivity([], [job], []);
    expect(items[0]?.label).toBe("Host Footprint Lite — example.com");
  });

  it("labels proposals without summary using proposal title", () => {
    const proposal: ProposalRecord = {
      id: testId(51),
      caseId: testId(10),
      jobId: testId(11),
      capabilityId: "network.shodan.lookup",
      playbookId: null,
      status: "pending",
      patch: [],
      summary: null,
      suppressedCount: 0,
      evidenceIds: [],
      rejectReason: null,
      decidedBy: null,
      decidedByLabel: null,
      decidedAt: null,
      createdAt: "2026-01-02T00:00:00.000Z",
      agentSourced: false,
      userOverridden: false,
      createdBy: null,
      createdByLabel: null,
    };
    const items = buildCaseOverviewActivity([], [], [proposal]);
    expect(items[0]?.label).toBe("Shodan Lookup");
  });

  it("deep-links activity rows to collect and triage detail", () => {
    const evidence: EvidenceRecord = {
      id: testId(40),
      caseId: testId(10),
      entityId: null,
      kind: "attestation",
      label: "note",
      notes: null,
      mime: "text/plain",
      uri: null,
      sha256: null,
      text: null,
      sourceUrl: null,
      actorId: "test-actor",
      actorLabel: "test-actor",
      capturedAt: "2026-01-01T00:00:00.000Z",
      processedAt: null,
      deletedAt: null,
    };
    const job: JobListRecord = {
      id: testId(11),
      caseId: testId(10),
      capabilityId: "network.dns.lookup",
      status: "running",
      input: {},
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
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
      playbookFanIndex: 0,
      evidenceIds: [],
      output: [],
      actorId: "test-actor",
      actorLabel: "test-actor",
    };
    const proposal: ProposalRecord = {
      id: testId(51),
      caseId: testId(10),
      jobId: null,
      capabilityId: null,
      playbookId: null,
      status: "pending",
      patch: [],
      summary: "review",
      suppressedCount: 0,
      evidenceIds: [],
      rejectReason: null,
      decidedBy: null,
      decidedByLabel: null,
      decidedAt: null,
      createdAt: "2026-01-03T00:00:00.000Z",
      agentSourced: false,
      userOverridden: false,
      createdBy: null,
      createdByLabel: null,
    };
    const items = buildCaseOverviewActivity([evidence], [job], [proposal], 3);
    expect(items.find((row) => row.kind === "evidence")?.href).toEqual({
      to: "/collect",
      search: { id: testId(40) },
    });
    expect(items.find((row) => row.kind === "job")?.href).toEqual({
      to: "/collect",
      search: { id: testId(11) },
    });
    expect(items.find((row) => row.kind === "proposal")?.href).toEqual({
      to: "/triage",
      search: { proposalId: testId(51) },
    });
  });
});

describe("jobEvidenceLabelsForActivity", () => {
  it("includes only evidence referenced by job inputs", () => {
    const evidenceId = testId(43);
    const otherId = testId(44);
    const job: JobListRecord = {
      id: testId(12),
      caseId: testId(10),
      capabilityId: "evidence.harvest",
      status: "running",
      input: { evidenceId },
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
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
      playbookFanIndex: 0,
      evidenceIds: [],
      output: [],
      actorId: "test-actor",
      actorLabel: "test-actor",
    };
    const labels = jobEvidenceLabelsForActivity(
      [job],
      [
        {
          id: evidenceId,
          caseId: testId(10),
          entityId: null,
          kind: "file",
          label: "Hidden dump",
          notes: null,
          mime: "text/plain",
          uri: null,
          sha256: null,
          text: null,
          sourceUrl: null,
          actorId: "test-actor",
          actorLabel: "test-actor",
          capturedAt: "2026-01-02T00:00:00.000Z",
          processedAt: null,
          deletedAt: "2026-01-02T00:00:00.000Z",
        },
        {
          id: otherId,
          caseId: testId(10),
          entityId: null,
          kind: "file",
          label: "Other",
          notes: null,
          mime: "text/plain",
          uri: null,
          sha256: null,
          text: null,
          sourceUrl: null,
          actorId: "test-actor",
          actorLabel: "test-actor",
          capturedAt: "2026-01-02T00:00:00.000Z",
          processedAt: null,
          deletedAt: null,
        },
      ]
    );
    expect(labels).toEqual({ [evidenceId]: "Hidden dump" });
  });
});

describe("jobEntityLabelsForActivity", () => {
  it("includes only entities referenced by job inputs", () => {
    const entityId = testId(47);
    const otherId = testId(48);
    const job: JobListRecord = {
      id: testId(12),
      caseId: testId(10),
      capabilityId: "network.shodan.lookup",
      status: "running",
      input: { entityId },
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
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
      playbookFanIndex: 0,
      evidenceIds: [],
      output: [],
      actorId: "test-actor",
      actorLabel: "test-actor",
    };
    const labels = jobEntityLabelsForActivity(
      [job],
      [
        { id: entityId, name: "Acme Corp", slug: "acme-corp" },
        { id: otherId, name: "Other Co", slug: "other-co" },
      ]
    );
    expect(labels).toEqual({ [entityId]: "Acme Corp" });
  });

  it("returns empty map when no jobs reference entities", () => {
    const labels = jobEntityLabelsForActivity(
      [{ input: {} } as Pick<JobListRecord, "input">],
      [{ id: testId(47), name: "Acme Corp" }]
    );
    expect(labels).toEqual({});
  });
});

import type { EvidenceRecord } from "@watchdog/core/evidence";
import type { JobListRecord, JobRecord } from "@watchdog/core/jobs";
import type { ProposalRecord } from "@watchdog/core/proposals";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit/fixtures";

/**
 * In-memory record builders for web tests: one valid default per record, any field
 * overridden. Use these instead of a local `evidence()` / `job()` / `proposal()` factory
 * so a field added to the record type is fixed here once.
 */

export const buildEvidenceRecord = (
  overrides: Partial<EvidenceRecord> = {}
): EvidenceRecord => ({
  id: testId(40),
  caseId: testCaseId(10),
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
});

export const buildJobListRecord = (
  overrides: Partial<JobListRecord> = {}
): JobListRecord => ({
  id: testId(11),
  caseId: testCaseId(10),
  capabilityId: "network.dns.lookup",
  status: "queued",
  input: { host: "mailhost.test" },
  output: [],
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
  playbookFanIndex: 0,
  retryOfJobId: null,
  evidenceIds: [],
  actorId: "test-actor",
  actorLabel: "test-actor",
  ...overrides,
});

export const buildJobRecord = (
  overrides: Partial<JobRecord> = {}
): JobRecord => ({
  ...buildJobListRecord(),
  output: null,
  logs: [],
  ...overrides,
});

export const buildProposalRecord = (
  overrides: Partial<ProposalRecord> = {}
): ProposalRecord => ({
  id: testId(50),
  caseId: testCaseId(10),
  jobId: null,
  capabilityId: "network.dns.lookup",
  playbookId: null,
  status: "pending",
  patch: [
    {
      op: "create",
      resource: "claim",
      id: testId(30),
      data: {
        entityId: testId(20),
        text: "Ada observed a host",
        class: "observation",
      },
      evidenceIds: [testId(40)],
    },
  ],
  summary: "dns",
  suppressedCount: 0,
  evidenceIds: [testId(41)],
  rejectReason: null,
  decidedBy: null,
  decidedByLabel: null,
  decidedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  agentSourced: false,
  userOverridden: false,
  createdBy: null,
  createdByLabel: null,
  identifierCollisions: [],
  ...overrides,
});

import type {
  CapListItem,
  CapProviderInfo,
  PlaybookListItem,
} from "@/domains/jobs/types";
import type {
  CaseRecord,
  DeletedCaseRecord,
  RestoredCaseRecord,
} from "@watchdog/core/cases";
import type { EvidenceRecord } from "@watchdog/core/evidence";
import type {
  CaseIdentifierRecord,
  EntityListConnection,
  EntityListItem,
  EntityRecord,
} from "@watchdog/core/graph";
import type {
  JobListRecord,
  JobRecord,
  ProviderCallList,
  ProviderCallRecord,
} from "@watchdog/core/jobs";
import type { ProposalRecord } from "@watchdog/core/proposals";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit/fixtures";

/**
 * In-memory record builders for web tests: one valid default per record, any field
 * overridden. Use these instead of a local `evidence()` / `job()` / `proposal()` factory
 * so a field added to the record type is fixed here once.
 */

/** A Cap provider for `CapListItem` fixtures: the type requires one. */
export const testCapProvider: CapProviderInfo = {
  name: "Test provider",
  url: "https://example.com",
  termsUrl: "https://example.com/terms",
  tier: "free",
  commercialUse: "unknown",
};

/** A Cap catalog entry; override any field. */
export const buildCapListItem = (
  overrides: Partial<CapListItem> = {}
): CapListItem => ({
  id: "network.dns.lookup",
  version: "1",
  title: "DNS lookup",
  provider: testCapProvider,
  egress: ["target"],
  contacts: [{ kind: "target", via: "dns" }],
  consumes: [{ kind: "host" }],
  input: {},
  inputForm: {},
  ...overrides,
});

/** A Playbook catalog entry; override any field. */
export const buildPlaybookListItem = (
  overrides: Partial<PlaybookListItem> = {}
): PlaybookListItem => ({
  id: "host-footprint",
  title: "Host footprint",
  description: "Resolve and fingerprint a host.",
  seedKinds: ["host"],
  steps: ["network.dns.lookup"],
  stepDependencies: [[]],
  requires: {
    credentials: [],
    egress: ["target"],
    contacts: [{ kind: "target", via: "dns" }],
    flags: [],
  },
  ...overrides,
});

export const buildCaseRecord = (
  overrides: Partial<CaseRecord> = {}
): CaseRecord => ({
  id: testCaseId(10),
  name: "Alpha",
  slug: "alpha",
  description: null,
  allowedEgress: ["local", "target"],
  ...overrides,
});

export const buildRestoredCaseRecord = (
  overrides: Partial<RestoredCaseRecord> = {}
): RestoredCaseRecord => ({
  ...buildCaseRecord(),
  previousSlug: null,
  ...overrides,
});

export const buildDeletedCaseRecord = (
  overrides: Partial<DeletedCaseRecord> = {}
): DeletedCaseRecord => ({
  id: testCaseId(10),
  name: "Alpha",
  slug: "alpha",
  description: null,
  deletedAt: "2026-10-01T12:00:00.000Z",
  deletedById: "test-actor",
  deletedByName: "Ada Owner",
  purgeAt: "2026-10-31T12:00:00.000Z",
  daysLeft: 30,
  purging: false,
  purgeError: null,
  ...overrides,
});

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

export const buildEntityRecord = (
  overrides: Partial<EntityRecord> = {}
): EntityRecord => ({
  id: testId(20),
  caseId: testCaseId(10),
  kind: "org",
  name: "Acme Ltd",
  slug: "acme-ltd",
  summary: null,
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: 1,
  ...overrides,
});

/** A row of the Entity list: an Entity with no Connections unless overridden. */
export const buildEntityListItem = (
  overrides: Partial<EntityListItem> = {}
): EntityListItem => ({
  ...buildEntityRecord(),
  connections: { outgoing: 0, incoming: 0 },
  soleConnection: null,
  ...overrides,
});

/** A listed Entity's Connection: an outgoing `associate_of` from `testId(20)`. */
export const buildEntityListConnection = (
  overrides: Partial<EntityListConnection> = {}
): EntityListConnection => ({
  id: testId(30),
  fromId: testId(20),
  toId: testId(21),
  predicate: "associate_of",
  confidence: "unverified",
  notes: null,
  peerId: testId(21),
  peerName: "John Doe",
  peerSlug: "john-doe",
  peerKind: "person",
  direction: "out",
  version: 1,
  ...overrides,
});

export const buildCaseIdentifierRecord = (
  overrides: Partial<CaseIdentifierRecord> = {}
): CaseIdentifierRecord => ({
  id: testId(60),
  entityId: testId(20),
  type: "email",
  platform: "",
  value: "contact@example.com",
  confidence: "possible",
  status: "current",
  notes: null,
  evidenceIds: [],
  version: 1,
  entityName: "Acme Ltd",
  entitySlug: "acme-ltd",
  entityKind: "org",
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
  playbookRunOutcome: null,
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

/** A provider call that returned 200 with a stored, downloadable body; override any field. */
export const buildProviderCallRecord = (
  overrides: Partial<ProviderCallRecord> = {}
): ProviderCallRecord => ({
  id: testId(60),
  jobId: testId(11),
  capabilityId: "network.dns.lookup",
  capVersion: "v-abc123",
  transport: "http",
  method: "GET",
  url: "https://provider.test/v1/host?key=[redacted]",
  startedAt: "2026-01-01T00:00:00.000Z",
  outcome: "response",
  status: 200,
  hops: 1,
  headersMs: 40,
  durationMs: 120,
  failureTag: null,
  failureReason: null,
  requestBody: { state: "none", sha256: null, bytes: null },
  body: {
    kind: "response",
    state: "stored",
    reason: null,
    sha256: "a".repeat(64),
    bytes: 2048,
    contentType: "text/html; charset=utf-8",
    isDownloadable: true,
  },
  isServedFromCache: false,
  original: null,
  ...overrides,
});

/** The calls of a Job or Evidence item: one call, a complete record, no cache hit. */
export const buildProviderCallList = (
  overrides: Partial<ProviderCallList> = {}
): ProviderCallList => ({
  provenance: "complete",
  calls: [buildProviderCallRecord()],
  isTruncated: false,
  cacheHits: [],
  areCacheHitsTruncated: false,
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
  createdBy: null,
  createdByLabel: null,
  identifierCollisions: [],
  ...overrides,
});

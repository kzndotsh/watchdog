import { z } from "zod";

import { READINESS_REASONS } from "@watchdog/core/infra";
import { PROVIDER_CALL_LIST_MAX } from "@watchdog/core/jobs";
import { egressClassSchema } from "@watchdog/schemas/caps";
import { patchOpSchema } from "@watchdog/schemas/graph";
import {
  listPageSchema,
  pageSchema,
  PROVENANCE_STATES,
  PROVIDER_BODY_KINDS,
  PROVIDER_BODY_REASONS,
  PROVIDER_BODY_STATES,
  PROVIDER_CALL_OUTCOMES,
  PROVIDER_CALL_TRANSPORTS,
  PROVIDER_REQUEST_BODY_STATES,
  caseIdSchema,
  claimClassSchema,
  confidenceTierSchema,
  edgePredicateSchema,
  entityKindSchema,
  evidenceKindSchema,
  identifierStatusSchema,
  identifierTypeSchema,
  jobStatusSchema,
  jsonObjectSchema,
  playbookRunOutcomeSchema,
  playbookRunStatusSchema,
  proposalStatusSchema,
  questionStatusSchema,
  retractKindSchema,
} from "@watchdog/schemas/shared";

/** Agent ingress escape hatch — required as `true` for API-key child Graph writes. */
export const userOverrideSchema = z
  .literal(true)
  .optional()
  .describe("Required as true when authenticating with an API key.");

export const caseSchema = z.object({
  id: caseIdSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  /** The egress classes the Case allows; `local` is always one. */
  allowedEgress: z.array(egressClassSchema),
});

/** A restored Case; `previousSlug` is set when its old link was taken and it got a new one. */
export const restoredCaseSchema = caseSchema.extend({
  previousSlug: z.string().nullable(),
});

/** A deleted Case as Deleted Cases lists it (owners and admins only). */
export const deletedCaseSchema = z.object({
  id: caseIdSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  deletedAt: z.string(),
  deletedById: z.string().nullable(),
  /** Display name of `deletedById`; null when unknown or the user is gone. */
  deletedByName: z.string().nullable(),
  /** When the scheduled purge takes the Case (the end of the restore window). */
  purgeAt: z.string(),
  /** Whole days left to restore it; 0 once the window has passed. */
  daysLeft: z.number().int().min(0),
  /** A purge has begun: the Case can no longer be restored, only purged. */
  purging: z.boolean(),
  /** The last purge attempt's failure; the scheduled purge retries it. */
  purgeError: z.string().nullable(),
});

export const deletedCasesPageSchema = z.object({
  items: z.array(deletedCaseSchema),
  /** Pass as `cursor` for the next page; null on the last page. */
  nextCursor: z.string().nullable(),
});

export const deletionPolicySchema = z.object({
  /** Days a deleted Case stays restorable before the scheduled purge erases it. */
  restoreWindowDays: z.number().int().min(1),
  /** The caller is an owner or admin: they may delete, restore and purge Cases. */
  canManage: z.boolean(),
  /** With a `caseId`: queued and running Jobs a delete of it would cancel. */
  cancellableJobs: z.number().int().min(0),
  /** The caller is an owner or admin and the instance runs `WD_BREACH_CAPS=full`: an Export may include breach credentials. */
  canIncludeBreachCredentials: z.boolean(),
});

export const entitySchema = z.object({
  id: z.uuid(),
  caseId: caseIdSchema,
  kind: entityKindSchema,
  name: z.string(),
  slug: z.string(),
  summary: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: z.number().int().positive(),
});

export const claimSchema = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  class: claimClassSchema,
  text: z.string(),
  confidence: confidenceTierSchema,
  retracted: z.boolean(),
  retractKind: retractKindSchema.nullable(),
  retractedReason: z.string().nullable(),
  retractedBy: z.string().nullable(),
  retractedAt: z.string().nullable(),
  evidenceIds: z.array(z.uuid()),
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: z.number().int().positive(),
});

export const identifierSchema = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  type: identifierTypeSchema,
  platform: z.string(),
  value: z.string(),
  confidence: confidenceTierSchema,
  status: identifierStatusSchema,
  notes: z.string().nullable(),
  evidenceIds: z.array(z.uuid()),
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: z.number().int().positive(),
});

/** A row of the Identifier list: the Identifier with its owning Entity's labels. */
export const caseIdentifierSchema = identifierSchema.extend({
  entityName: z.string(),
  entitySlug: z.string(),
  entityKind: entityKindSchema,
});

export const edgeSchema = z.object({
  id: z.uuid(),
  fromId: z.uuid(),
  toId: z.uuid(),
  predicate: edgePredicateSchema,
  confidence: confidenceTierSchema,
  notes: z.string().nullable(),
  evidenceIds: z.array(z.uuid()),
  peerId: z.uuid(),
  peerName: z.string(),
  peerSlug: z.string(),
  peerKind: entityKindSchema,
  direction: z.enum(["out", "in"]),
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: z.number().int().positive(),
});

/**
 * A row of the Entity list: the Entity with its Connection counts, and its one Connection (an
 * Edge seen from it, without Evidence links) when it has exactly one; null otherwise.
 */
const entityListItemSchema = entitySchema.extend({
  connections: z.object({
    outgoing: z.number().int().min(0),
    incoming: z.number().int().min(0),
  }),
  soleConnection: edgeSchema.omit({ evidenceIds: true }).nullable(),
});

/** Case-wide edge list — absolute endpoints (no peer/direction). */
const caseEdgeSchema = z.object({
  id: z.uuid(),
  fromId: z.uuid(),
  fromName: z.string(),
  fromSlug: z.string(),
  fromKind: entityKindSchema,
  toId: z.uuid(),
  toName: z.string(),
  toSlug: z.string(),
  toKind: entityKindSchema,
  predicate: edgePredicateSchema,
  confidence: confidenceTierSchema,
  notes: z.string().nullable(),
  evidenceIds: z.array(z.uuid()),
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: z.number().int().positive(),
});

export const eventSchema = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  when: z.string(),
  what: z.string(),
  where: z.string().nullable(),
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: z.number().int().positive(),
});

export const questionSchema = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  text: z.string(),
  status: questionStatusSchema,
  resolvedNote: z.string().nullable(),
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: z.number().int().positive(),
});

export const presignedUploadSchema = z.object({
  url: z.string(),
  uri: z.string(),
  sha256: z.string(),
  mime: z.string(),
  byteLength: z.number().int(),
  expiresIn: z.number().int(),
  headers: z.record(z.string(), z.string()),
});

export const evidenceSchema = z.object({
  id: z.uuid(),
  caseId: caseIdSchema,
  entityId: z.uuid().nullable(),
  kind: evidenceKindSchema,
  label: z.string().nullable(),
  notes: z.string().nullable(),
  mime: z.string().nullable(),
  uri: z.string().nullable(),
  sha256: z.string().nullable(),
  text: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  actorId: z.string(),
  actorLabel: z.string(),
  capturedAt: z.string(),
  processedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
});

/** An Evidence picker's item (#566): title parts and capture time, no body. */
const evidencePickerItemSchema = z.object({
  id: z.uuid(),
  kind: evidenceKindSchema,
  label: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  sha256: z.string().nullable(),
  capturedAt: z.string(),
});

export const jobSchema = z.object({
  id: z.uuid(),
  caseId: caseIdSchema,
  capabilityId: z.string(),
  input: jsonObjectSchema,
  output: z
    .array(
      z.object({
        name: z.string(),
        mime: z.string(),
        uri: z.string(),
        sha256: z.string(),
      })
    )
    .nullable(),
  status: jobStatusSchema,
  error: z.string().nullable(),
  interpretError: z.string().nullable(),
  proposalId: z.uuid().nullable(),
  evidenceIds: z.array(z.uuid()).nullable(),
  resultSummary: z.string().nullable(),
  fromCache: z.boolean(),
  suppressedCount: z.number().int(),
  actorId: z.string(),
  actorLabel: z.string(),
  logs: z.array(z.string()),
  playbookRunId: z.uuid().nullable(),
  playbookStep: z.number().int().nullable(),
  playbookFanIndex: z.number().int(),
  retryOfJobId: z.uuid().nullable(),
  playbookId: z.string().nullable(),
  playbookRunStatus: playbookRunStatusSchema.nullable(),
  playbookRunOutcome: playbookRunOutcomeSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

const jobListSchema = jobSchema.omit({ logs: true });

const providerCallBodySchema = z.object({
  kind: z.enum(PROVIDER_BODY_KINDS),
  state: z.enum(PROVIDER_BODY_STATES),
  reason: z.enum(PROVIDER_BODY_REASONS).nullable(),
  sha256: z.string().nullable(),
  bytes: z.number().int().nullable(),
  contentType: z
    .string()
    .nullable()
    .describe("The provider's own Content-Type, as recorded."),
  isDownloadable: z
    .boolean()
    .describe(
      "The raw response is stored: GET /cases/{caseId}/provider-calls/{callId}/response serves it as an attachment."
    ),
});

const providerCallRequestBodySchema = z.object({
  state: z.enum(PROVIDER_REQUEST_BODY_STATES),
  sha256: z.string().nullable(),
  bytes: z.number().int().nullable(),
});

const providerCallOriginalSchema = z.object({
  callId: z.uuid(),
  jobId: z.uuid(),
});

const providerCallSchema = z.object({
  id: z.uuid(),
  jobId: z.uuid(),
  capabilityId: z.string(),
  capVersion: z.string().nullable(),
  transport: z.enum(PROVIDER_CALL_TRANSPORTS),
  method: z.string(),
  url: z.string().describe("Redacted when recorded. Text, not a link."),
  startedAt: z.string(),
  outcome: z
    .enum(PROVIDER_CALL_OUTCOMES)
    .nullable()
    .describe("Null when no outcome was recorded."),
  status: z.number().int().nullable(),
  hops: z.number().int(),
  headersMs: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  failureTag: z.string().nullable(),
  failureReason: z.string().nullable(),
  requestBody: providerCallRequestBodySchema,
  body: providerCallBodySchema.nullable(),
  isServedFromCache: z.boolean(),
  original: providerCallOriginalSchema
    .nullable()
    .describe(
      "The call a cache answered for, only when it is a call of this Case."
    ),
});

const providerCallCacheHitSchema = z.object({
  jobId: z.uuid(),
  sourceJobId: z
    .uuid()
    .nullable()
    .describe(
      "The Job the cached result came from, only when it is a Job of this Case."
    ),
});

export const providerCallListSchema = z.object({
  provenance: z
    .enum(PROVENANCE_STATES)
    .describe(
      "incomplete: calls or outcomes were lost, so a short or empty list is a gap, not no calls."
    ),
  calls: z.array(providerCallSchema).max(PROVIDER_CALL_LIST_MAX),
  isTruncated: z.boolean(),
  cacheHits: z.array(providerCallCacheHitSchema).max(PROVIDER_CALL_LIST_MAX),
  areCacheHitsTruncated: z.boolean(),
});

const identifierCollisionSchema = z.object({
  opId: z.uuid(),
  type: identifierTypeSchema,
  value: z.string(),
  entityId: z.uuid(),
  entityName: z.string(),
  entitySlug: z.string(),
});

export const proposalSchema = z.object({
  id: z.uuid(),
  caseId: caseIdSchema,
  jobId: z.uuid().nullable(),
  capabilityId: z.string().nullable(),
  playbookId: z.string().nullable(),
  status: proposalStatusSchema,
  patch: z.array(patchOpSchema),
  summary: z.string().nullable(),
  suppressedCount: z.number().int(),
  evidenceIds: z.array(z.uuid()),
  rejectReason: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decidedByLabel: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  agentSourced: z.boolean(),
  createdBy: z.string().nullable(),
  createdByLabel: z.string().nullable(),
  entityNames: z.record(z.string(), z.string()).optional(),
  entitySlugs: z.record(z.string(), z.string()).optional(),
  identifierCollisions: z.array(identifierCollisionSchema).optional(),
});

export const graphWriteResultSchema = z.object({
  writeId: z.uuid(),
  confidence: z.literal("unverified"),
  opCount: z.number().int(),
  replayed: z.boolean(),
  actorLabel: z.string(),
});

const graphWriteRecordSchema = z.object({
  id: z.uuid(),
  caseId: caseIdSchema,
  actorId: z.string(),
  actorLabel: z.string(),
  channel: z.string(),
  userOverridden: z.boolean(),
  confidence: confidenceTierSchema,
  summary: z.string().nullable(),
  createdAt: z.string(),
});

export const credentialSlotSchema = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string(),
  configured: z.boolean(),
  updatedAt: z.string().nullable(),
  breachDisabled: z.boolean(),
});

const dependencyStatusSchema = z.enum(["ok", ...READINESS_REASONS]);

export const readinessSchema = z.object({
  ok: z.boolean(),
  database: dependencyStatusSchema,
  storage: dependencyStatusSchema,
});

/*
 * One named page schema per list procedure: `{ items, nextCursor }`, `items` in a stable order,
 * `nextCursor` the `cursor` of the next page (null on the last).
 */
export const casePageSchema = pageSchema(caseSchema);
export const claimPageSchema = pageSchema(claimSchema);
export const edgePageSchema = pageSchema(edgeSchema);
export const caseEdgePageSchema = pageSchema(caseEdgeSchema);
export const eventPageSchema = pageSchema(eventSchema);
export const questionPageSchema = pageSchema(questionSchema);
export const jobListPageSchema = pageSchema(jobListSchema);
export const graphWritePageSchema = pageSchema(graphWriteRecordSchema);
/** Declared lists (ADR-0007): a page plus `total` on the first page. */
export const entityListPageSchema = listPageSchema(entityListItemSchema);
export const evidenceListPageSchema = listPageSchema(evidenceSchema);
export const proposalListPageSchema = listPageSchema(proposalSchema);
export const evidencePickerPageSchema = listPageSchema(
  evidencePickerItemSchema
);
export const identifierListPageSchema = listPageSchema(caseIdentifierSchema);

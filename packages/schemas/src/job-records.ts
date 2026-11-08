import { z } from "zod";

import {
  jobStatusSchema,
  playbookRunOutcomeSchema,
  playbookRunStatusSchema,
} from "./enums";
import { evidenceSchema } from "./evidence-records";
import { caseIdSchema } from "./ids";
import { jsonObjectSchema } from "./json-wire";
import { listPageSchema } from "./lists/list-page";
import { COLLECT_ROW_KINDS, COLLECT_ROW_STATES } from "./vocab-collect-queue";
import {
  PROVENANCE_STATES,
  PROVIDER_BODY_KINDS,
  PROVIDER_BODY_REASONS,
  PROVIDER_BODY_STATES,
  PROVIDER_CALL_OUTCOMES,
  PROVIDER_CALL_TRANSPORTS,
  PROVIDER_REQUEST_BODY_STATES,
} from "./vocab-provider-call";

/** Most calls a provider-call read returns. A Job makes a handful; a longer list is cut and says so. */
export const PROVIDER_CALL_LIST_MAX = 200;

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

export const jobListSchema = jobSchema.omit({ logs: true });

/** A row of Collect's queue (#574): an Evidence row, a playbook run or a lone Job, with its members. */
export const collectQueueItemSchema = z.object({
  id: z.uuid(),
  kind: z.enum(COLLECT_ROW_KINDS),
  state: z.enum(COLLECT_ROW_STATES),
  sortAt: z.string(),
  activityAt: z.string(),
  entityId: z.uuid().nullable(),
  capabilityIds: z.array(z.string()),
  playbookRunId: z.uuid().nullable(),
  evidence: evidenceSchema.nullable(),
  jobs: z.array(jobListSchema),
  /** Labels of the Evidence and Entities the Jobs' inputs name, by id. */
  titles: z.object({
    evidence: z.record(z.string(), z.string()),
    entity: z.record(z.string(), z.string()),
  }),
});

export const providerCallBodySchema = z.object({
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

export const providerCallRequestBodySchema = z.object({
  state: z.enum(PROVIDER_REQUEST_BODY_STATES),
  sha256: z.string().nullable(),
  bytes: z.number().int().nullable(),
});

export const providerCallOriginalSchema = z.object({
  callId: z.uuid(),
  jobId: z.uuid(),
});

export const providerCallSchema = z.object({
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

export const providerCallCacheHitSchema = z.object({
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

export const jobListPageSchema = listPageSchema(jobListSchema);
export const collectListPageSchema = listPageSchema(collectQueueItemSchema);
/** `collect.get`: the row an id belongs to, and the member Job to focus (null for a row's own id). */
export const collectLocatedSchema = z.object({
  item: collectQueueItemSchema,
  focusJobId: z.uuid().nullable(),
});

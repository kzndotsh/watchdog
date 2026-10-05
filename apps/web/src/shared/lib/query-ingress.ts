import { getCaseByIdInputSchema } from "@/domains/cases/types";
import {
  caseIdInputSchema,
  caseSlugInputSchema,
} from "@/domains/entities/types";
import {
  getCaseBySlugInputSchema,
  searchCaseInputSchema,
} from "@watchdog/schemas/cases";
import { listEvidenceInputSchema } from "@watchdog/schemas/evidence";
import {
  listRecentActivityInputSchema,
  taskFiltersSchema,
  type ListRecentActivityInput,
  type TaskFiltersInput,
} from "@watchdog/schemas/feed";
import {
  caseScopeInputSchema,
  entityScopeInputSchema,
  evidenceScopeInputSchema,
} from "@watchdog/schemas/graph";
import {
  getJobInputSchema,
  listJobsInputSchema,
  listProposalsInputSchema,
} from "@watchdog/schemas/jobs";
import {
  entitySlugSchema,
  parseOptionalTrimmedUuid,
  parseTrimmedCaseId,
  parseTrimmedUuid,
  type ProposalStatus,
} from "@watchdog/schemas/shared";

type TaskListFilters = Omit<TaskFiltersInput, "caseId">;
/** Filters carry plain strings; the Case id brand is minted when they are parsed. */
export type RecentActivityFilters = Omit<
  Partial<ListRecentActivityInput>,
  "caseId"
> & { caseId?: string };

/** Normalize query keys; strict parse happens again in queryFn. */
export function scopeCaseSlugSegment(caseSlug: string): string {
  const parsed = getCaseBySlugInputSchema.safeParse({ caseSlug });
  return parsed.success ? parsed.data.caseSlug : caseSlug.trim();
}

/** True when `caseSlug` slugifies to a non-empty route segment. */
export function scopeCaseSlugSegmentEnabled(caseSlug: string): boolean {
  return getCaseBySlugInputSchema.safeParse({ caseSlug }).success;
}

export function scopeJobDetail(caseId: string, jobId: string) {
  const parsed = getJobInputSchema.safeParse({ caseId, jobId });
  return parsed.success
    ? parsed.data
    : {
        caseId: parseTrimmedCaseId(caseId) ?? caseId.trim(),
        jobId: parseTrimmedUuid(jobId) ?? jobId.trim(),
      };
}

export function scopeCaseId(caseId: string): string {
  const parsed = caseIdInputSchema.safeParse({ caseId });
  return parsed.success ? parsed.data.caseId : caseId.trim();
}

/** True when `caseId` is a valid graph UUID (case-scoped fetch may run). */
export function scopeCaseIdEnabled(caseId: string): boolean {
  return parseTrimmedCaseId(caseId) !== null;
}

/** True when both ids are valid graph UUIDs (entity-scoped fetch may run). */
export function scopeEntityScopeEnabled(
  caseId: string,
  entityId: string
): boolean {
  return (
    parseTrimmedCaseId(caseId) !== null && parseTrimmedUuid(entityId) !== null
  );
}

/** True when both ids are valid graph UUIDs (job detail fetch may run). */
export function scopeJobDetailEnabled(caseId: string, jobId: string): boolean {
  return (
    parseTrimmedCaseId(caseId) !== null && parseTrimmedUuid(jobId) !== null
  );
}

/** True when optional case filter is absent or a valid graph UUID. */
export function scopeRecentActivityEnabled(
  filters?: RecentActivityFilters
): boolean {
  const caseId = filters?.caseId;
  if (caseId === undefined) return true;
  return parseTrimmedCaseId(caseId) !== null;
}

/** True when case id and optional entity filter are valid graph UUIDs. */
export function scopeTaskListEnabled(
  caseId: string,
  filters?: TaskListFilters
): boolean {
  return taskFiltersSchema.safeParse({ caseId, ...filters }).success;
}

/** Trim + validate optional graph UUID for URL/query keys; invalid → undefined. */
export function scopeOptionalUuid(
  id: string | null | undefined
): string | undefined {
  return parseOptionalTrimmedUuid(id);
}

export function scopeEntityScope(caseId: string, entityId: string) {
  const parsed = entityScopeInputSchema.safeParse({ caseId, entityId });
  return parsed.success
    ? parsed.data
    : {
        caseId: parseTrimmedCaseId(caseId) ?? caseId.trim(),
        entityId: parseTrimmedUuid(entityId) ?? entityId.trim(),
      };
}

export function scopeEvidenceDownload(caseId: string, evidenceId: string) {
  const parsed = evidenceScopeInputSchema.safeParse({ caseId, evidenceId });
  if (parsed.success) {
    return { scoped: parsed.data, enabled: true };
  }
  const scopedCaseId = parseTrimmedCaseId(caseId) ?? "";
  const scopedEvidenceId = parseTrimmedUuid(evidenceId) ?? "";
  return {
    scoped: { caseId: scopedCaseId, evidenceId: scopedEvidenceId },
    enabled: scopedCaseId !== "" && scopedEvidenceId !== "",
  };
}

export function scopeCaseSlug(caseId: string, slug: string) {
  const parsed = caseSlugInputSchema.safeParse({ caseId, slug });
  if (parsed.success) {
    return { scoped: parsed.data, enabled: true };
  }
  const scopedCaseId = parseTrimmedCaseId(caseId) ?? caseId.trim();
  const slugParsed = entitySlugSchema.safeParse(slug);
  const scopedSlug = slugParsed.success ? slugParsed.data : slug.trim();
  return {
    scoped: { caseId: scopedCaseId, slug: scopedSlug },
    enabled: parseTrimmedCaseId(caseId) !== null && slugParsed.success,
  };
}

export function parseCaseByIdInput(caseId: string) {
  return getCaseByIdInputSchema.parse({ caseId });
}

export function parseCaseBySlugInput(caseSlug: string) {
  return getCaseBySlugInputSchema.parse({ caseSlug });
}

export function parseCaseIdInput(caseId: string) {
  return caseIdInputSchema.parse({ caseId });
}

export function parseCaseSlugInput(caseId: string, slug: string) {
  return caseSlugInputSchema.parse({ caseId, slug });
}

export function parseListJobsInput(caseId: string) {
  return listJobsInputSchema.parse({ caseId });
}

export function parseGetJobInput(caseId: string, jobId: string) {
  return getJobInputSchema.parse({ caseId, jobId });
}

export function parseListEvidenceInput(caseId: string, hiddenOnly: boolean) {
  return listEvidenceInputSchema.parse({ caseId, hiddenOnly });
}

export function parseEvidenceScopeInput(caseId: string, evidenceId: string) {
  return evidenceScopeInputSchema.parse({ caseId, evidenceId });
}

export function parseListProposalsInput(
  caseId: string,
  status?: ProposalStatus
) {
  return listProposalsInputSchema.parse(
    status === undefined ? { caseId } : { caseId, status }
  );
}

export function parseEntityScopeInput(caseId: string, entityId: string) {
  return entityScopeInputSchema.parse({ caseId, entityId });
}

export function parseCaseScopeInput(caseId: string) {
  return caseScopeInputSchema.parse({ caseId });
}

export function scopeSearchCaseInput(caseId: string, q: string) {
  const trimmedQ = q.trim();
  const parsed = searchCaseInputSchema.safeParse({ caseId, q: trimmedQ });
  if (parsed.success) {
    return parsed.data;
  }
  const scopedCaseId = parseTrimmedCaseId(caseId);
  return {
    caseId: scopedCaseId ?? "",
    q: trimmedQ,
  };
}

export function parseSearchCaseInput(caseId: string, q: string) {
  return searchCaseInputSchema.parse({ caseId, q: q.trim() });
}

function taskListFilterPayload(
  caseId: string,
  filters?: TaskListFilters
): Omit<TaskFiltersInput, "caseId"> & { caseId: string } {
  return { caseId, ...filters };
}

export function scopeTaskListFilters(
  caseId: string,
  filters?: TaskListFilters
) {
  const parsed = taskFiltersSchema.safeParse(
    taskListFilterPayload(caseId, filters)
  );
  if (!parsed.success) {
    return {
      scopedCaseId: parseTrimmedCaseId(caseId) ?? caseId.trim(),
      filters,
    };
  }
  const {
    caseId: scopedCaseId,
    entityId,
    status,
    unattachedOnly,
  } = parsed.data;
  const scopedFilters: TaskListFilters = {
    ...(entityId === undefined ? {} : { entityId }),
    ...(status === undefined ? {} : { status }),
    ...(unattachedOnly === undefined ? {} : { unattachedOnly }),
  };
  return { scopedCaseId, filters: scopedFilters };
}

export function parseTaskFiltersInput(
  caseId: string,
  filters?: TaskListFilters
) {
  return taskFiltersSchema.parse(taskListFilterPayload(caseId, filters));
}

export function scopeRecentActivityFilters(filters?: RecentActivityFilters) {
  const parsed = listRecentActivityInputSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    const scoped: RecentActivityFilters = {};
    const caseId = filters?.caseId;
    if (caseId !== undefined) {
      const normalized = parseTrimmedCaseId(caseId);
      if (normalized !== null) scoped.caseId = normalized;
    }
    const limit = filters?.limit;
    if (typeof limit === "number" && limit >= 1 && limit <= 50) {
      scoped.limit = limit;
    }
    return scoped;
  }
  const scoped: RecentActivityFilters = {
    ...(parsed.data.caseId === undefined ? {} : { caseId: parsed.data.caseId }),
    ...(parsed.data.limit === undefined ? {} : { limit: parsed.data.limit }),
  };
  return scoped;
}

export function parseListRecentActivityInput(filters?: RecentActivityFilters) {
  return listRecentActivityInputSchema.parse(filters ?? {});
}

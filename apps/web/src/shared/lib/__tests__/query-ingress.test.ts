import { describe, expect, it } from "vitest";

import {
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeCaseSlug,
  scopeCaseSlugSegmentEnabled,
  scopeEntityScope,
  scopeEntityScopeEnabled,
  scopeEvidenceDownload,
  scopeJobDetail,
  scopeJobDetailEnabled,
  scopeOptionalUuid,
  scopeRecentActivityEnabled,
  scopeRecentActivityFilters,
  scopeSearchCaseInput,
  scopeTaskListEnabled,
  scopeTaskListFilters,
} from "@/shared/lib/query-ingress";
import { testId } from "@watchdog/test-kit";

describe("query ingress helpers", () => {
  it("normalizes padded case ids for query keys", () => {
    const caseId = testId(10);
    expect(scopeCaseId(`  ${caseId}  `)).toBe(caseId);
    expect(scopeCaseId("case-1")).toBe("case-1");
  });

  it("normalizes padded entity scope for query keys", () => {
    const caseId = testId(10);
    const entityId = testId(20);
    expect(scopeEntityScope(` ${caseId} `, ` ${entityId} `)).toEqual({
      caseId,
      entityId,
    });
  });

  it("trims search queries without requiring min length for keys", () => {
    const caseId = testId(10);
    expect(scopeSearchCaseInput(` ${caseId} `, "  alpha  ")).toEqual({
      caseId,
      q: "alpha",
    });
  });

  it("normalizes padded task list filters for query keys", () => {
    const caseId = testId(10);
    const entityId = testId(20);
    expect(
      scopeTaskListFilters(` ${caseId} `, { entityId: ` ${entityId} ` })
    ).toEqual({
      scopedCaseId: caseId,
      filters: { entityId },
    });
  });

  it("returns empty case id when uuid is invalid", () => {
    expect(scopeSearchCaseInput("case-1", "alpha")).toEqual({
      caseId: "",
      q: "alpha",
    });
  });

  it("normalizes padded activity case ids for query keys", () => {
    const caseId = testId(10);
    expect(scopeRecentActivityFilters({ caseId: `  ${caseId}  ` })).toEqual({
      caseId,
    });
  });

  it("drops invalid activity case ids for query keys", () => {
    expect(scopeRecentActivityFilters({ caseId: "case-1" })).toEqual({});
  });

  it("normalizes padded evidence download scope and gates invalid ids", () => {
    const caseId = testId(10);
    const evidenceId = testId(20);
    expect(scopeEvidenceDownload(` ${caseId} `, ` ${evidenceId} `)).toEqual({
      scoped: { caseId, evidenceId },
      enabled: true,
    });
    expect(scopeEvidenceDownload("case-1", evidenceId)).toEqual({
      scoped: { caseId: "", evidenceId },
      enabled: false,
    });
    expect(scopeEvidenceDownload(caseId, "")).toEqual({
      scoped: { caseId, evidenceId: "" },
      enabled: false,
    });
  });

  it("scopeOptionalUuid trims valid ids and drops invalid", () => {
    const id = testId(30);
    expect(scopeOptionalUuid(`  ${id}  `)).toBe(id);
    expect(scopeOptionalUuid("case-1")).toBe(undefined);
    expect(scopeOptionalUuid("")).toBe(undefined);
  });

  it("gates case slug segment fetches on slugified route segments", () => {
    expect(scopeCaseSlugSegmentEnabled("alpha")).toBe(true);
    expect(scopeCaseSlugSegmentEnabled("  Alpha Corp  ")).toBe(true);
    expect(scopeCaseSlugSegmentEnabled("!!!")).toBe(false);
  });

  it("gates case-scoped fetches on valid UUIDs", () => {
    const caseId = testId(10);
    const entityId = testId(20);
    const jobId = testId(30);
    expect(scopeCaseIdEnabled(`  ${caseId}  `)).toBe(true);
    expect(scopeCaseIdEnabled("case-1")).toBe(false);
    expect(scopeEntityScopeEnabled(caseId, entityId)).toBe(true);
    expect(scopeEntityScopeEnabled("case-1", entityId)).toBe(false);
    expect(scopeJobDetailEnabled(caseId, jobId)).toBe(true);
    expect(scopeJobDetailEnabled(caseId, "job-1")).toBe(false);
    expect(scopeRecentActivityEnabled({ caseId })).toBe(true);
    expect(scopeRecentActivityEnabled({ caseId: "case-1" })).toBe(false);
    expect(scopeRecentActivityEnabled()).toBe(true);
    expect(scopeTaskListEnabled(caseId)).toBe(true);
    expect(scopeTaskListEnabled("case-1")).toBe(false);
    expect(scopeTaskListEnabled(caseId, { entityId })).toBe(true);
    expect(scopeTaskListEnabled(caseId, { entityId: "ent-1" })).toBe(false);
  });

  it("gates entity slug scope when case id or slug is invalid", () => {
    const caseId = testId(10);
    expect(scopeCaseSlug(` ${caseId} `, "alpha")).toEqual({
      scoped: { caseId, slug: "alpha" },
      enabled: true,
    });
    expect(scopeCaseSlug("case-1", "alpha")).toEqual({
      scoped: { caseId: "case-1", slug: "alpha" },
      enabled: false,
    });
    expect(scopeCaseSlug(caseId, "!!!")).toEqual({
      scoped: { caseId, slug: "!!!" },
      enabled: false,
    });
  });

  it("normalizes padded job detail scope for query keys", () => {
    const caseId = testId(10);
    const jobId = testId(20);
    expect(scopeJobDetail(` ${caseId} `, ` ${jobId} `)).toEqual({
      caseId,
      jobId,
    });
  });
});

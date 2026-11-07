import { describe, expect, it, vi } from "vitest";

vi.mock("@/domains/cases/cases.functions", () => ({
  getCasesContextFn: vi.fn(),
  getCaseByIdFn: vi.fn(),
  getCaseCountsFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
  getDeletedCaseBySlugFn: vi.fn(),
  getDeletionPolicyFn: vi.fn(),
  listDeletedCasesPageFn: vi.fn(),
}));

import {
  caseByIdQuery,
  caseCountsQuery,
  caseBySlugQuery,
  casesContextQuery,
  casesKeys,
  deletedCaseBySlugQuery,
} from "@/domains/cases/queries";
import { placeholderFor } from "@/testing/query-placeholder";
import { buildCaseRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";

describe("cases queries", () => {
  it("keys the counts by Case and by day", () => {
    const caseId = testCaseId(1);
    const day = "2026-03-10T00:00:00.000Z";
    const key = caseCountsQuery(caseId, day).queryKey;

    expect(caseCountsQuery(testCaseId(2), day).queryKey).not.toEqual(key);
    expect(
      caseCountsQuery(caseId, "2026-03-11T00:00:00.000Z").queryKey
    ).not.toEqual(key);
  });

  it("reads a Case by id or slug only when the id is a uuid or the slug is usable", () => {
    expect(caseByIdQuery("case-1").enabled).toBe(false);
    expect(caseByIdQuery(testCaseId(1)).enabled).toBe(true);
    expect(caseBySlugQuery("alpha").enabled).toBe(true);
    expect(caseBySlugQuery("!!!").enabled).toBe(false);
    expect(deletedCaseBySlugQuery("alpha").enabled).toBe(true);
    expect(deletedCaseBySlugQuery("!!!").enabled).toBe(false);
  });

  it("keeps previous data only for the same query key", () => {
    const one = buildCaseRecord({ id: testCaseId(1) });
    const query = caseByIdQuery(testCaseId(1));

    expect(placeholderFor(query, one, casesKeys.detail(testCaseId(1)))).toBe(
      one
    );
    expect(
      placeholderFor(query, one, casesKeys.detail(testCaseId(2)))
    ).toBeUndefined();
  });

  it("keeps the context's previous data for the context key only", () => {
    const context = { cases: [], active: null };
    const query = casesContextQuery();

    expect(placeholderFor(query, context, casesKeys.context())).toBe(context);
    expect(placeholderFor(query, context, casesKeys.counts())).toBeUndefined();
  });
});

import { ORPCError } from "@orpc/client";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import {
  caseByIdQuery,
  caseCountsQuery,
  caseBySlugQuery,
  casesKeys,
  deletedCaseBySlugQuery,
  visibleCasesQuery,
} from "@/domains/cases/queries";
import { procedureDouble } from "@/testing/orpc-client";
import { placeholderFor } from "@/testing/query-placeholder";
import { buildCaseRecord, buildDeletedCaseRecord } from "@/testing/records";
import { PAGE_LIMIT_MAX } from "@watchdog/schemas/shared";
import { testCaseId } from "@watchdog/schemas/testing";

const getCase = procedureDouble("cases.get");
const getCaseBySlug = procedureDouble("cases.getBySlug");
const getDeletedBySlug = procedureDouble("cases.getDeletedBySlug");
const listCases = procedureDouble("cases.list");

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

  it("reads the visible Cases as one page of cases.list", async () => {
    const row = buildCaseRecord({ id: testCaseId(1) });
    listCases.mockResolvedValue({
      items: [row],
      nextCursor: null,
      total: { count: 1, isCapped: false },
    });

    await expect(new QueryClient().query(visibleCasesQuery())).resolves.toEqual(
      [row]
    );
    expect(listCases).toHaveBeenCalledWith({ limit: PAGE_LIMIT_MAX });
  });

  it("asks cases.get, cases.getBySlug and cases.getDeletedBySlug with the trimmed id or slug", async () => {
    const row = buildCaseRecord({ id: testCaseId(1), slug: "alpha" });
    getCase.mockResolvedValue(row);
    getCaseBySlug.mockResolvedValue(row);
    const deleted = buildDeletedCaseRecord({ slug: "alpha" });
    getDeletedBySlug.mockResolvedValue(deleted);
    const client = new QueryClient();

    await expect(
      client.query(caseByIdQuery(` ${testCaseId(1)} `))
    ).resolves.toBe(row);
    expect(getCase).toHaveBeenLastCalledWith({ caseId: testCaseId(1) });
    await expect(client.query(caseBySlugQuery("alpha"))).resolves.toBe(row);
    expect(getCaseBySlug).toHaveBeenLastCalledWith({ caseSlug: "alpha" });
    await expect(client.query(deletedCaseBySlugQuery("alpha"))).resolves.toBe(
      deleted
    );
    expect(getDeletedBySlug).toHaveBeenLastCalledWith({ caseSlug: "alpha" });
  });

  it("answers null when the Case is not found, and rethrows any other failure", async () => {
    getCase.mockRejectedValue(new ORPCError("NOT_FOUND"));
    getCaseBySlug.mockRejectedValue(new ORPCError("NOT_FOUND"));
    getDeletedBySlug.mockRejectedValue(new ORPCError("NOT_FOUND"));
    const client = new QueryClient();

    await expect(
      client.query(caseByIdQuery(testCaseId(1)))
    ).resolves.toBeNull();
    await expect(client.query(caseBySlugQuery("alpha"))).resolves.toBeNull();
    await expect(
      client.query(deletedCaseBySlugQuery("alpha"))
    ).resolves.toBeNull();

    getCase.mockRejectedValue(new ORPCError("FORBIDDEN"));
    await expect(
      new QueryClient().query({
        ...caseByIdQuery(testCaseId(1)),
        retry: false,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

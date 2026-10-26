import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (schema: { parse: (value: unknown) => unknown }) => ({
      handler:
        (fn: (input: { data: unknown; context: unknown }) => unknown) =>
        (input: { data: unknown; context: unknown }) =>
          fn({ ...input, data: schema.parse(input.data) }),
    }),
    handler:
      (fn: (input: { context: unknown }) => unknown) =>
      (input?: { context?: unknown }) =>
        fn({ context: {}, ...input }),
  }),
}));

const casesApi = {
  list: vi.fn(),
  get: vi.fn(),
  getBySlug: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  restore: vi.fn(),
  purge: vi.fn(),
  listDeleted: vi.fn(),
  getDeletedBySlug: vi.fn(),
  deletionPolicy: vi.fn(),
};

vi.mock("@/lib/orpc.server", () => ({
  orpcFromContext: () => ({ cases: casesApi }),
  orpcNullIfNotFound: (value: unknown) => value,
}));

const resolveActiveCase = vi.hoisted(() => vi.fn());
vi.mock("@/domains/cases/cases-active.server", () => ({ resolveActiveCase }));

vi.mock("@/domains/cases/lib/active-case.server", () => ({
  readActiveCaseId: vi.fn(),
  writeActiveCaseId: vi.fn(),
}));

import {
  deleteCaseFn,
  getCaseBySlugFn,
  getCasesContextFn,
  getDeletedCaseBySlugFn,
  getDeletionPolicyFn,
  healActiveCaseFn,
  listDeletedCasesPageFn,
  purgeCaseFn,
  restoreCaseFn,
  setActiveCaseIdFn,
} from "@/domains/cases/cases.functions";
import {
  readActiveCaseId,
  writeActiveCaseId,
} from "@/domains/cases/lib/active-case.server";
import type { CaseRecord } from "@/domains/cases/types";
import { asCaseId } from "@watchdog/schemas/shared";

type ServerContext = {
  context: Record<string, never>;
};
type ServerDataContext<T> = {
  data: T;
  context: Record<string, never>;
};

const CASE_A: CaseRecord = {
  id: asCaseId("550e8400-e29b-41d4-a716-446655440000"),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

const CASE_B: CaseRecord = {
  id: asCaseId("660e8400-e29b-41d4-a716-446655440001"),
  slug: "beta",
  name: "Beta",
  description: null,
  allowedEgress: [
    "local",
    "target",
    "public_lookup",
    "account_lookup",
    "model",
  ],
};

const getCaseBySlug = getCaseBySlugFn as unknown as (
  input: ServerDataContext<{ caseSlug: string }>
) => Promise<CaseRecord | null>;

describe("cases.functions", () => {
  it("heals the active case cookie when the stored id is missing", async () => {
    const stale = asCaseId("770e8400-e29b-41d4-a716-446655440009");
    resolveActiveCase.mockResolvedValue({
      cases: [CASE_A, CASE_B],
      active: CASE_A,
    });
    vi.mocked(readActiveCaseId).mockReturnValue(stale);

    const ctx = await (
      getCasesContextFn as unknown as (
        input: ServerContext
      ) => Promise<{ cases: CaseRecord[]; active: CaseRecord | null }>
    )({
      context: {},
    });

    expect(ctx.active).toEqual(CASE_A);
    expect(resolveActiveCase).toHaveBeenCalledWith({}, stale);
    expect(writeActiveCaseId).toHaveBeenCalledWith(CASE_A.id);
  });

  it("leaves the cookie alone when the stored id is already the resolved Active Case", async () => {
    vi.mocked(writeActiveCaseId).mockClear();
    resolveActiveCase.mockResolvedValue({
      cases: [CASE_A, CASE_B],
      active: CASE_B,
    });
    vi.mocked(readActiveCaseId).mockReturnValue(CASE_B.id);

    const ctx = await (
      getCasesContextFn as unknown as (
        input: ServerContext
      ) => Promise<{ cases: CaseRecord[]; active: CaseRecord | null }>
    )({ context: {} });

    expect(ctx.active).toEqual(CASE_B);
    expect(writeActiveCaseId).not.toHaveBeenCalled();
  });

  it("clears the cookie when the organization has no Cases", async () => {
    vi.mocked(writeActiveCaseId).mockClear();
    resolveActiveCase.mockResolvedValue({ cases: [], active: null });
    vi.mocked(readActiveCaseId).mockReturnValue(CASE_A.id);

    await (
      getCasesContextFn as unknown as (input: ServerContext) => Promise<unknown>
    )({ context: {} });

    expect(writeActiveCaseId).toHaveBeenCalledWith(null);
  });

  it("resolves a case by slug through the org-scoped procedure", async () => {
    casesApi.getBySlug.mockResolvedValue(CASE_B);

    const row = await getCaseBySlug({
      data: { caseSlug: "beta" },
      context: {},
    });

    expect(row).toEqual(CASE_B);
    expect(casesApi.getBySlug).toHaveBeenCalledWith({ caseSlug: "beta" });
  });

  it("answers null for a slug the caller's organization cannot see (not found, whoever owns it)", async () => {
    casesApi.getBySlug.mockResolvedValue(null);

    const row = await getCaseBySlug({
      data: { caseSlug: "their-case" },
      context: {},
    });

    expect(row).toBeNull();
  });

  it("trims padded case slug before lookup", async () => {
    casesApi.getBySlug.mockResolvedValue(CASE_B);

    await getCaseBySlug({ data: { caseSlug: "  beta  " }, context: {} });

    expect(casesApi.getBySlug).toHaveBeenLastCalledWith({ caseSlug: "beta" });
  });

  it("rejects setting an active case id that does not exist", async () => {
    casesApi.get.mockResolvedValue(null);

    await expect(
      (
        setActiveCaseIdFn as unknown as (
          input: ServerDataContext<{ caseId: string }>
        ) => Promise<string | null>
      )({
        data: { caseId: CASE_A.id },
        context: {},
      })
    ).rejects.toThrow("Case not found");
  });

  const heal = healActiveCaseFn as unknown as (
    input: ServerDataContext<{
      caseId: string;
      expectedActiveCaseId: string | null;
    }>
  ) => Promise<{ changed: boolean }>;

  it("heals the cookie to the route's Case when it still holds the expected value", async () => {
    vi.mocked(readActiveCaseId).mockReturnValue(asCaseId(CASE_B.id));
    vi.mocked(writeActiveCaseId).mockClear();
    casesApi.get.mockResolvedValue(CASE_A);

    const result = await heal({
      data: { caseId: CASE_A.id, expectedActiveCaseId: CASE_B.id },
      context: {},
    });

    expect(result).toEqual({ changed: true });
    expect(writeActiveCaseId).toHaveBeenCalledWith(CASE_A.id);
  });

  it("heals an unset cookie when the client observed none", async () => {
    vi.mocked(readActiveCaseId).mockReturnValue(null);
    vi.mocked(writeActiveCaseId).mockClear();
    casesApi.get.mockResolvedValue(CASE_A);

    const result = await heal({
      data: { caseId: CASE_A.id, expectedActiveCaseId: null },
      context: {},
    });

    expect(result).toEqual({ changed: true });
    expect(writeActiveCaseId).toHaveBeenCalledWith(CASE_A.id);
  });

  it("does not overwrite a cookie a newer switch changed after the loader read it", async () => {
    // The loader observed B; the user switched to C before heal(A) reached the server.
    const CASE_C = "770e8400-e29b-41d4-a716-446655440002";
    vi.mocked(readActiveCaseId).mockReturnValue(asCaseId(CASE_C));
    vi.mocked(writeActiveCaseId).mockClear();
    casesApi.get.mockResolvedValue(CASE_A);

    const result = await heal({
      data: { caseId: CASE_A.id, expectedActiveCaseId: CASE_B.id },
      context: {},
    });

    expect(result).toEqual({ changed: false });
    expect(writeActiveCaseId).not.toHaveBeenCalled();
  });

  it("leaves the cookie alone when the route's Case is already Active", async () => {
    vi.mocked(readActiveCaseId).mockReturnValue(asCaseId(CASE_A.id));
    vi.mocked(writeActiveCaseId).mockClear();

    const result = await heal({
      data: { caseId: CASE_A.id, expectedActiveCaseId: CASE_A.id },
      context: {},
    });

    expect(result).toEqual({ changed: false });
    expect(writeActiveCaseId).not.toHaveBeenCalled();
  });

  it("refuses to heal to a Case outside the caller's org and writes no cookie", async () => {
    vi.mocked(readActiveCaseId).mockReturnValue(asCaseId(CASE_B.id));
    vi.mocked(writeActiveCaseId).mockClear();
    casesApi.get.mockResolvedValue(null);

    await expect(
      heal({
        data: { caseId: CASE_A.id, expectedActiveCaseId: CASE_B.id },
        context: {},
      })
    ).rejects.toThrow("Case not found");
    expect(writeActiveCaseId).not.toHaveBeenCalled();
  });

  it("does not write the cookie when setting a Case that is not found", async () => {
    vi.mocked(writeActiveCaseId).mockClear();
    casesApi.get.mockResolvedValue(null);

    await expect(
      (
        setActiveCaseIdFn as unknown as (
          input: ServerDataContext<{ caseId: string }>
        ) => Promise<string | null>
      )({ data: { caseId: CASE_A.id }, context: {} })
    ).rejects.toThrow("Case not found");
    expect(writeActiveCaseId).not.toHaveBeenCalled();
  });

  it("clears or advances the active case cookie after delete", async () => {
    vi.mocked(readActiveCaseId).mockReturnValue(asCaseId(CASE_A.id));
    casesApi.delete.mockResolvedValue(undefined);
    resolveActiveCase.mockResolvedValue({ cases: [CASE_B], active: CASE_B });

    await (
      deleteCaseFn as unknown as (
        input: ServerDataContext<{ caseId: string }>
      ) => Promise<void>
    )({ data: { caseId: CASE_A.id }, context: {} });

    expect(casesApi.delete).toHaveBeenCalledWith({ caseId: CASE_A.id });
    expect(writeActiveCaseId).toHaveBeenCalledWith(CASE_B.id);
  });

  it("restores a deleted Case through the API", async () => {
    casesApi.restore.mockResolvedValue({ ...CASE_A, previousSlug: "old" });

    const restored = await restoreCaseFn({ data: { caseId: CASE_A.id } });

    expect(casesApi.restore).toHaveBeenCalledWith({ caseId: CASE_A.id });
    expect(restored).toEqual({ ...CASE_A, previousSlug: "old" });
  });

  it("purges a deleted Case through the API (the API itself refuses an API key)", async () => {
    casesApi.purge.mockResolvedValue({ ok: true });

    await purgeCaseFn({ data: { caseId: CASE_A.id } });

    expect(casesApi.purge).toHaveBeenCalledWith({ caseId: CASE_A.id });
  });

  it("rejects a Case id that is not a Case id before calling the API", async () => {
    casesApi.restore.mockClear();

    await expect(async () =>
      restoreCaseFn({ data: { caseId: "nope" } })
    ).rejects.toThrow();

    expect(casesApi.restore).not.toHaveBeenCalled();
  });

  it("lists deleted Cases a page at a time, with the cursor", async () => {
    casesApi.listDeleted.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: null,
    });

    await listDeletedCasesPageFn({
      data: { q: "alpha", sort: "name.asc", cursor: "cur", limit: 25 },
    });

    expect(casesApi.listDeleted).toHaveBeenCalledWith({
      q: "alpha",
      sort: "name.asc",
      cursor: "cur",
      limit: 25,
    });
  });

  it("asks for the deleted Case a slug names, and passes the null of a miss through", async () => {
    casesApi.getDeletedBySlug.mockResolvedValue(null);

    const result = await getDeletedCaseBySlugFn({
      data: { caseSlug: "alpha" },
    });

    expect(casesApi.getDeletedBySlug).toHaveBeenCalledWith({
      caseSlug: "alpha",
    });
    expect(result).toBeNull();
  });

  it("reads the deletion policy", async () => {
    casesApi.deletionPolicy.mockResolvedValue({
      restoreWindowDays: 30,
      canIncludeBreachCredentials: false,
      canManage: true,
      cancellableJobs: 2,
    });

    expect(await getDeletionPolicyFn({ data: { caseId: CASE_A.id } })).toEqual({
      restoreWindowDays: 30,
      canIncludeBreachCredentials: false,
      canManage: true,
      cancellableJobs: 2,
    });
    expect(casesApi.deletionPolicy).toHaveBeenCalledWith({
      caseId: CASE_A.id,
    });
  });
});

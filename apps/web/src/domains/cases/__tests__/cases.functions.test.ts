import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (schema: { parse: (value: unknown) => unknown }) => ({
      handler:
        (fn: (input: { data: unknown; context: unknown }) => unknown) =>
        (input: { data: unknown; context: unknown }) =>
          fn({ ...input, data: schema.parse(input.data) }),
    }),
    handler: (fn: unknown) => fn,
  }),
}));

const casesApi = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/lib/orpc.server", () => ({
  orpcFromContext: () => ({ cases: casesApi }),
  orpcNullIfNotFound: (value: unknown) => value,
}));

vi.mock("@/domains/cases/lib/active-case.server", () => ({
  readActiveCaseId: vi.fn(),
  writeActiveCaseId: vi.fn(),
}));

import {
  deleteCaseFn,
  getCaseBySlugFn,
  getCasesContextFn,
  setActiveCaseIdFn,
} from "@/domains/cases/cases.functions";
import {
  readActiveCaseId,
  writeActiveCaseId,
} from "@/domains/cases/lib/active-case.server";
import type { CaseRecord } from "@/domains/cases/types";

interface ServerContext {
  context: Record<string, never>;
}
interface ServerDataContext<T> {
  data: T;
  context: Record<string, never>;
}

const CASE_A: CaseRecord = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

const CASE_B: CaseRecord = {
  id: "660e8400-e29b-41d4-a716-446655440001",
  slug: "beta",
  name: "Beta",
  description: null,
  allowThirdPartyEgress: true,
};

describe("cases.functions", () => {
  it("heals the active case cookie when the stored id is missing", async () => {
    casesApi.list.mockResolvedValue([CASE_A, CASE_B]);
    vi.mocked(readActiveCaseId).mockReturnValue("missing-id");

    const ctx = await (
      getCasesContextFn as unknown as (
        input: ServerContext
      ) => Promise<{ cases: CaseRecord[]; active: CaseRecord | null }>
    )({
      context: {},
    });

    expect(ctx.active).toEqual(CASE_A);
    expect(writeActiveCaseId).toHaveBeenCalledWith(CASE_A.id);
  });

  it("resolves a case by slug from the cases list", async () => {
    casesApi.list.mockResolvedValue([CASE_A, CASE_B]);

    const row = await (
      getCaseBySlugFn as unknown as (
        input: ServerDataContext<{ caseSlug: string }>
      ) => Promise<CaseRecord | null>
    )({
      data: { caseSlug: "beta" },
      context: {},
    });

    expect(row).toEqual(CASE_B);
  });

  it("trims padded case slug before lookup", async () => {
    casesApi.list.mockResolvedValue([CASE_A, CASE_B]);

    const row = await (
      getCaseBySlugFn as unknown as (
        input: ServerDataContext<{ caseSlug: string }>
      ) => Promise<CaseRecord | null>
    )({
      data: { caseSlug: "  beta  " },
      context: {},
    });

    expect(row).toEqual(CASE_B);
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

  it("clears or advances the active case cookie after delete", async () => {
    vi.mocked(readActiveCaseId).mockReturnValue(CASE_A.id);
    casesApi.delete.mockResolvedValue(undefined);
    casesApi.list.mockResolvedValue([CASE_B]);

    await (
      deleteCaseFn as unknown as (
        input: ServerDataContext<{ caseId: string }>
      ) => Promise<void>
    )({ data: { caseId: CASE_A.id }, context: {} });

    expect(casesApi.delete).toHaveBeenCalledWith({ caseId: CASE_A.id });
    expect(writeActiveCaseId).toHaveBeenCalledWith(CASE_B.id);
  });
});

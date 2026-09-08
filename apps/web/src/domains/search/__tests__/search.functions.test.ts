import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({
      handler: (fn: unknown) => fn,
    }),
    handler: (fn: unknown) => fn,
  }),
}));

const searchCaseMock = vi.fn();

vi.mock("@/lib/orpc.server", () => ({
  orpcFromContext: () => ({
    search: { case: searchCaseMock },
  }),
}));

import { searchCaseFn } from "@/domains/search/search.functions";

interface ServerDataContext<T> {
  data: T;
  context: Record<string, never>;
}

describe("search.functions", () => {
  it("delegates case search to the ORPC search endpoint", async () => {
    const payload = {
      caseId: "550e8400-e29b-41d4-a716-446655440000",
      q: "alpha",
    };
    const hits = {
      entities: [],
      identifiers: [],
      evidence: [],
      tasks: [],
      jobs: [],
      proposals: [],
      cases: [],
      evidenceLabels: {},
      entityLabels: {},
    };
    searchCaseMock.mockResolvedValue(hits);

    const result = await (
      searchCaseFn as unknown as (
        input: ServerDataContext<typeof payload>
      ) => Promise<typeof hits>
    )({
      data: payload,
      context: {},
    });

    expect(searchCaseMock).toHaveBeenCalledWith(payload);
    expect(result).toEqual(hits);
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";

const setActiveCaseIdFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/cases/cases.functions", () => ({
  setActiveCaseIdFn,
}));

vi.mock("@/shared/lib/active-case-switch", () => ({
  optimisticActiveCaseSwitch: vi.fn(async () => ({ prev: null, next: null })),
  rollbackActiveCaseSwitch: vi.fn(),
  navigateAfterActiveCaseSwitch: vi.fn(),
  finalizeActiveCaseSwitch: vi.fn(),
}));

import { useSelectActiveCase } from "../use-select-active-case";

const CASE_ID = "550e8400-e29b-41d4-a716-446655440000";

const cases: CaseRecord[] = [
  {
    id: CASE_ID,
    name: "Alpha",
    slug: "alpha",
    description: null,
    allowThirdPartyEgress: false,
  },
];

describe("useSelectActiveCase", () => {
  it("calls setActiveCaseIdFn when mutating", async () => {
    setActiveCaseIdFn.mockResolvedValueOnce(undefined);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });

    const { result } = renderHook(() => useSelectActiveCase({ cases }), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    result.current.mutate(CASE_ID);

    await waitFor(() => {
      expect(setActiveCaseIdFn).toHaveBeenCalledWith({
        data: { caseId: CASE_ID },
      });
    });
  });
});

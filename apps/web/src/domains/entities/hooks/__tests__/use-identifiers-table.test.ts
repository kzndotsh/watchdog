import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => ({
  createIdentifierFn: vi.fn(),
  updateIdentifierFn: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/ui/identifiers/identifier-composer", () => ({
  identifierCreateCanSubmit: vi.fn(() => true),
  useIdentifierCreateForm: (onSubmit: () => void) => ({
    reset: vi.fn(),
    handleSubmit: onSubmit,
    state: { isSubmitting: false, values: {} },
  }),
}));

vi.mock("@/shared/ui/data-table", () => ({
  useDataTable: () => ({ table: {} }),
  tableComposerKeyDown: vi.fn(),
}));

const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
    useMutation: (...args: unknown[]) => useMutationMock(...args),
  };
});

import { useIdentifiersTable } from "@/domains/entities/hooks/use-identifiers-table";

const ACTIVE: CaseRecord = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

function renderHookWithClient() {
  useQueryMock.mockImplementation(
    (options: { queryKey: readonly unknown[] }) => {
      switch (options.queryKey[0]) {
        case "identifiers":
        case "entities":
        case "evidence": {
          return {
            data: [],
            isFetched: true,
            isLoading: false,
            isError: false,
          };
        }
        default: {
          return {
            data: [],
            isFetched: true,
            isLoading: false,
            isError: false,
          };
        }
      }
    }
  );
  useMutationMock.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  });

  const client = new QueryClient();
  return renderHook(() => useIdentifiersTable(ACTIVE), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

describe("useIdentifiersTable", () => {
  it("starts with empty-table copy and entity/evidence options", () => {
    const { result } = renderHookWithClient();

    expect(result.current.emptyText).toBe(
      "No identifiers yet — add one below."
    );
    expect(result.current.entityOptions).toEqual([]);
    expect(result.current.evidenceOptions).toEqual([]);
    expect(result.current.rows).toEqual([]);
    expect(useQueryMock).toHaveBeenCalled();

    act(() => {
      result.current.openComposer();
    });
    expect(result.current.composing).toBe(true);
    expect(useMutationMock).toHaveBeenCalled();
    expect(result.current.typeFilter).toEqual([]);
  });
});

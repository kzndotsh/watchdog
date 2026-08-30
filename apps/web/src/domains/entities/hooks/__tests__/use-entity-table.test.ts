import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/entities/entities.functions", () => ({
  createEntityFn: vi.fn(),
  updateEntityFieldsFn: vi.fn(),
}));

vi.mock("@/domains/entities/edges/edges.functions", () => ({
  createEdgeFn: vi.fn(),
  updateEdgeFn: vi.fn(),
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

vi.mock("@tanstack/react-form", () => ({
  useForm: () => ({
    reset: vi.fn(),
    handleSubmit: vi.fn(),
    getFieldValue: vi.fn(() => ""),
    state: { isSubmitting: false, values: { name: "", kind: "person" } },
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

import { useEntityTable } from "@/domains/entities/hooks/use-entity-table";

const ACTIVE: CaseRecord = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

function queryResult(data: unknown) {
  return {
    data,
    isFetched: true,
    isLoading: false,
    isError: false,
    isPlaceholderData: false,
  };
}

function renderHookWithClient() {
  useQueryMock.mockImplementation(
    (options: { queryKey?: readonly unknown[] }) => {
      const key = options.queryKey?.[0];
      if (key === "entities") return queryResult([]);
      if (key === "edges") return queryResult([]);
      return queryResult([]);
    }
  );
  useMutationMock.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  });

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useEntityTable(ACTIVE), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

describe("useEntityTable", () => {
  it("starts with empty-table copy", () => {
    const { result } = renderHookWithClient();
    expect(result.current.emptyText).toBe("No entities yet — add one below.");
    expect(result.current.rows).toEqual([]);
    expect(useQueryMock).toHaveBeenCalled();

    act(() => {
      result.current.openComposer();
    });
    expect(result.current.composing).toBe(true);
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/entities/claims/claims.functions", () => ({
  listClaimsFn: vi.fn(),
}));

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
  };
});

import { useDossierSectionQuery } from "@/domains/dossier/hooks/use-dossier-section-query";
import { claimsListQuery } from "@/domains/entities/claims/queries";

describe("useDossierSectionQuery", () => {
  it("returns placeholder state from query", () => {
    useQueryMock.mockReturnValue({
      data: [{ id: "claim-1" }],
      isFetched: true,
      isLoading: false,
      isError: false,
      isPlaceholderData: true,
      refetch: vi.fn(),
    });

    const client = new QueryClient();
    const { result } = renderHook(
      () => useDossierSectionQuery(claimsListQuery("case-1", "entity-1")),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(QueryClientProvider, { client }, children),
      }
    );

    expect(result.current.data).toEqual([{ id: "claim-1" }]);
    expect(result.current.placeholder).toBe(true);
    expect(result.current.pending).toBe(false);
    expect(result.current.loadError).toBeNull();
  });

  it("surfaces loadError when the query fails", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isFetched: true,
      isLoading: false,
      isError: true,
      error: new Error("section failed"),
      isPlaceholderData: false,
      refetch: vi.fn(),
    });

    const client = new QueryClient();
    const { result } = renderHook(
      () => useDossierSectionQuery(claimsListQuery("case-1", "entity-1")),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(QueryClientProvider, { client }, children),
      }
    );

    expect(result.current.loadError).toBe("section failed");
  });

  it("does not stay pending when the query is disabled", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isFetched: false,
      isLoading: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    });

    const client = new QueryClient();
    const { result } = renderHook(
      () =>
        useDossierSectionQuery({
          ...claimsListQuery("case-1", "entity-1"),
          enabled: false,
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(QueryClientProvider, { client }, children),
      }
    );

    expect(result.current.pending).toBe(false);
    expect(result.current.loadError).toBeNull();
  });
});

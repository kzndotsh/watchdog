import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@/domains/cases/queries", () => ({
  casesContextQuery: () => ({
    queryKey: ["cases"],
    queryFn: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";

describe("useCasesContext", () => {
  it("returns empty lists while pending", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isFetched: false,
      isLoading: true,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useCasesContext());

    expect(result.current.pending).toBe(true);
    expect(result.current.cases).toEqual([]);
    expect(result.current.active).toBeNull();
    expect(result.current.loadError).toBeNull();
  });

  it("surfaces load errors with retry", () => {
    const refetch = vi.fn();
    useQueryMock.mockReturnValue({
      data: undefined,
      isFetched: true,
      isLoading: false,
      isError: true,
      error: new Error("cases down"),
      isPlaceholderData: false,
      refetch,
    });

    const { result } = renderHook(() => useCasesContext());

    expect(result.current.loadError).toBe("cases down");
    result.current.retry();
    expect(refetch).toHaveBeenCalled();
  });

  it("hides load errors while refetching after a failure", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isFetched: true,
      isLoading: false,
      isFetching: true,
      isError: true,
      error: new Error("cases down"),
      isPlaceholderData: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useCasesContext());

    expect(result.current.loadError).toBeNull();
  });

  it("passes silentError meta when requested", () => {
    useQueryMock.mockReturnValue({
      data: { cases: [], active: null },
      isFetched: true,
      isLoading: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    });

    renderHook(() => useCasesContext({ silentError: true }));

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ meta: { silentError: true } })
    );
  });
});

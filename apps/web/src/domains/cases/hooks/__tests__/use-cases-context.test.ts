import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { casesContextQuery } from "@/domains/cases/queries";

// Only the network boundary is faked: the hook reads through the real `casesContextQuery`
// under a real QueryClient (docs/contributing/testing/standards.md Mock policy).
vi.mock("@/domains/cases/cases.functions", () => ({
  getCasesContextFn: vi.fn(),
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
}));

import { getCasesContextFn } from "@/domains/cases/cases.functions";
import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";

function renderContext(options?: { silentError?: boolean }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = renderHook(() => useCasesContext(options), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
  return { ...view, client };
}

describe("useCasesContext", () => {
  beforeEach(() => {
    vi.mocked(getCasesContextFn).mockReset();
  });

  it("returns empty lists while pending", () => {
    vi.mocked(getCasesContextFn).mockReturnValue(new Promise(() => {}));

    const { result } = renderContext();

    expect(result.current.pending).toBe(true);
    expect(result.current.cases).toEqual([]);
    expect(result.current.active).toBeNull();
    expect(result.current.loadError).toBeNull();
  });

  it("returns the cases and the active case the query loaded", async () => {
    vi.mocked(getCasesContextFn).mockResolvedValue({ cases: [], active: null });

    const { result } = renderContext();

    await waitFor(() => {
      expect(result.current.pending).toBe(false);
    });
    expect(result.current.cases).toEqual([]);
    expect(result.current.loadError).toBeNull();
  });

  it("surfaces load errors with retry", async () => {
    vi.mocked(getCasesContextFn).mockRejectedValue(new Error("cases down"));
    const { result } = renderContext();
    await waitFor(() => {
      expect(result.current.loadError).toBe("cases down");
    });

    vi.mocked(getCasesContextFn).mockResolvedValue({ cases: [], active: null });
    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.loadError).toBeNull();
    });
    expect(result.current.pending).toBe(false);
  });

  it("hides load errors while refetching after a failure", async () => {
    vi.mocked(getCasesContextFn).mockRejectedValue(new Error("cases down"));
    const { result } = renderContext();
    await waitFor(() => {
      expect(result.current.loadError).toBe("cases down");
    });

    vi.mocked(getCasesContextFn).mockReturnValue(new Promise(() => {}));
    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.loadError).toBeNull();
    });
  });

  it("marks the query silentError when requested", async () => {
    vi.mocked(getCasesContextFn).mockResolvedValue({ cases: [], active: null });

    const { client } = renderContext({ silentError: true });

    await waitFor(() => {
      expect(
        client.getQueryCache().find({
          queryKey: casesContextQuery().queryKey,
        })?.meta
      ).toEqual({ silentError: true });
    });
  });
});

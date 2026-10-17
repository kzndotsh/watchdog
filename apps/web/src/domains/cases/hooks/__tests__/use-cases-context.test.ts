import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { casesContextQuery } from "@/domains/cases/queries";
import { testCaseId } from "@watchdog/schemas/testing";

// Only the network boundary is faked: the hook reads through the real `casesContextQuery`
// under a real QueryClient (docs/contributing/testing/standards.md Mock policy).
vi.mock("@/domains/cases/cases.functions", () => ({
  getCasesContextFn: vi.fn(),
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
}));

import { getCasesContextFn } from "@/domains/cases/cases.functions";
import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";
import type { CaseRecord } from "@/domains/cases/types";
import { RouteCaseContext } from "@/shared/hooks/use-route-case";
import { buildCaseRecord } from "@/testing/records";

function renderContext(
  options?: { silentError?: boolean },
  routeCase: CaseRecord | null = null
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = renderHook(() => useCasesContext(options), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(
        QueryClientProvider,
        { client },
        createElement(RouteCaseContext, { value: routeCase }, children)
      ),
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

  it("is the cookie's Case when the URL names none", async () => {
    const cookieCase = buildCaseRecord({ slug: "cookie", name: "Cookie" });
    vi.mocked(getCasesContextFn).mockResolvedValue({
      cases: [cookieCase],
      active: cookieCase,
    });

    const { result } = renderContext();

    await waitFor(() => {
      expect(result.current.active).toEqual(cookieCase);
    });
  });

  it("is the URL's Case, not the cookie's, so two tabs can hold two Cases", async () => {
    const cookieCase = buildCaseRecord({ slug: "cookie", name: "Cookie" });
    const urlCase = buildCaseRecord({
      id: testCaseId(11),
      slug: "url",
      name: "From the URL",
    });
    vi.mocked(getCasesContextFn).mockResolvedValue({
      cases: [cookieCase, urlCase],
      active: cookieCase,
    });

    const { result } = renderContext(undefined, urlCase);

    await waitFor(() => {
      expect(result.current.pending).toBe(false);
    });
    expect(result.current.active).toEqual(urlCase);
  });

  it("reads the URL's Case live from the list, so an edit shows", async () => {
    const stale = buildCaseRecord({ name: "Before" });
    vi.mocked(getCasesContextFn).mockResolvedValue({
      cases: [{ ...stale, name: "After" }],
      active: null,
    });

    const { result } = renderContext(undefined, stale);

    await waitFor(() => {
      expect(result.current.active?.name).toBe("After");
    });
  });

  it("falls back to the route's own row while the list has not loaded", () => {
    vi.mocked(getCasesContextFn).mockReturnValue(new Promise(() => {}));
    const urlCase = buildCaseRecord({ slug: "url" });

    const { result } = renderContext(undefined, urlCase);

    expect(result.current.active).toEqual(urlCase);
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

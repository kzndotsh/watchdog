import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LAST_CASE_STORAGE_KEY } from "@/domains/cases/lib/active-case";
import { visibleCasesQuery } from "@/domains/cases/queries";
import { testCaseId } from "@watchdog/domain/schemas/testing";

// Only the network boundary is faked: the hook reads through the real `visibleCasesQuery`
// under a real QueryClient (docs/contributing/testing/standards.md Mock policy).
vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";
import type { CaseRecord } from "@/domains/cases/types";
import { RouteCaseContext } from "@/shared/hooks/use-route-case";
import { procedureDouble } from "@/testing/orpc-client";
import { buildCaseRecord } from "@/testing/records";

const listCases = procedureDouble("cases.list");

/** One page of `cases.list` holding `items`. */
function casePage(items: CaseRecord[]) {
  return {
    items,
    nextCursor: null,
    total: { count: items.length, isCapped: false },
  };
}

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
  afterEach(() => {
    window.localStorage.removeItem(LAST_CASE_STORAGE_KEY);
  });

  beforeEach(() => {
    listCases.mockReset();
  });

  it("returns empty lists while pending", () => {
    listCases.mockReturnValue(new Promise(() => {}));

    const { result } = renderContext();

    expect(result.current.pending).toBe(true);
    expect(result.current.cases).toEqual([]);
    expect(result.current.active).toBeNull();
    expect(result.current.loadError).toBeNull();
  });

  it("returns the cases and the active case the query loaded", async () => {
    listCases.mockResolvedValue(casePage([]));

    const { result } = renderContext();

    await waitFor(() => {
      expect(result.current.pending).toBe(false);
    });
    expect(result.current.cases).toEqual([]);
    expect(result.current.loadError).toBeNull();
  });

  it("is the last Case entered when the URL names none", async () => {
    const first = buildCaseRecord({ slug: "first", name: "First" });
    const lastEntered = buildCaseRecord({
      id: testCaseId(12),
      slug: "last",
      name: "Last entered",
    });
    window.localStorage.setItem(LAST_CASE_STORAGE_KEY, lastEntered.id);
    listCases.mockResolvedValue(casePage([first, lastEntered]));

    const { result } = renderContext();

    await waitFor(() => {
      expect(result.current.active).toEqual(lastEntered);
    });
  });

  it("is the first visible Case when the last one entered is gone", async () => {
    const first = buildCaseRecord({ slug: "first", name: "First" });
    window.localStorage.setItem(LAST_CASE_STORAGE_KEY, testCaseId(99));
    listCases.mockResolvedValue(casePage([first]));

    const { result } = renderContext();

    await waitFor(() => {
      expect(result.current.active).toEqual(first);
    });
  });

  it("is the URL's Case, not the last one entered, so two tabs can hold two Cases", async () => {
    const lastEntered = buildCaseRecord({ slug: "last", name: "Last" });
    window.localStorage.setItem(LAST_CASE_STORAGE_KEY, lastEntered.id);
    const urlCase = buildCaseRecord({
      id: testCaseId(11),
      slug: "url",
      name: "From the URL",
    });
    listCases.mockResolvedValue(casePage([lastEntered, urlCase]));

    const { result } = renderContext(undefined, urlCase);

    await waitFor(() => {
      expect(result.current.pending).toBe(false);
    });
    expect(result.current.active).toEqual(urlCase);
  });

  it("reads the URL's Case live from the list, so an edit shows", async () => {
    const stale = buildCaseRecord({ name: "Before" });
    listCases.mockResolvedValue(casePage([{ ...stale, name: "After" }]));

    const { result } = renderContext(undefined, stale);

    await waitFor(() => {
      expect(result.current.active?.name).toBe("After");
    });
  });

  it("falls back to the route's own row while the list has not loaded", () => {
    listCases.mockReturnValue(new Promise(() => {}));
    const urlCase = buildCaseRecord({ slug: "url" });

    const { result } = renderContext(undefined, urlCase);

    expect(result.current.active).toEqual(urlCase);
  });

  it("surfaces load errors with retry", async () => {
    listCases.mockRejectedValue(new Error("cases down"));
    const { result } = renderContext();
    await waitFor(() => {
      expect(result.current.loadError).toBe("cases down");
    });

    listCases.mockResolvedValue(casePage([]));
    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.loadError).toBeNull();
    });
    expect(result.current.pending).toBe(false);
  });

  it("hides load errors while refetching after a failure", async () => {
    listCases.mockRejectedValue(new Error("cases down"));
    const { result } = renderContext();
    await waitFor(() => {
      expect(result.current.loadError).toBe("cases down");
    });

    listCases.mockReturnValue(new Promise(() => {}));
    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.loadError).toBeNull();
    });
  });

  it("marks the query silentError when requested", async () => {
    listCases.mockResolvedValue(casePage([]));

    const { client } = renderContext({ silentError: true });

    await waitFor(() => {
      expect(
        client.getQueryCache().find({
          queryKey: visibleCasesQuery().queryKey,
        })?.meta
      ).toEqual({ silentError: true });
    });
  });
});

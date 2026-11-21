import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { useLiveWorkCase } from "@/domains/cases/hooks/use-live-work-case";
import type { CaseRecord } from "@/domains/cases/types";
import { RouteCaseContext, useWorkCase } from "@/shared/hooks/use-route-case";
import { procedureDouble } from "@/testing/orpc-client";
import { buildCaseRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/domain/schemas/testing";

const listCases = procedureDouble("cases.list");

/** One page of `cases.list` holding `items`. */
function casePage(items: CaseRecord[]) {
  return {
    items,
    nextCursor: null,
    total: { count: items.length, isCapped: false },
  };
}

function wrapperFor(routeCase: ReturnType<typeof buildCaseRecord> | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(RouteCaseContext, { value: routeCase }, children)
    );
}

describe("a Work screen outside a Case route", () => {
  it("fails loudly instead of falling back to the last Case entered", () => {
    const otherCase = buildCaseRecord({ slug: "other" });
    listCases.mockResolvedValue(casePage([otherCase]));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      renderHook(() => useLiveWorkCase(), { wrapper: wrapperFor(null) })
    ).toThrow("useWorkCase needs a Case route");
    expect(() =>
      renderHook(() => useWorkCase(), { wrapper: wrapperFor(null) })
    ).toThrow("useWorkCase needs a Case route");

    quiet.mockRestore();
  });
});

describe("useLiveWorkCase", () => {
  it("is the URL's Case, not the last one entered", async () => {
    const urlCase = buildCaseRecord({ slug: "url", name: "From the URL" });
    const otherCase = buildCaseRecord({
      id: testCaseId(11),
      slug: "other",
    });
    listCases.mockResolvedValue(casePage([urlCase, otherCase]));

    const { result } = renderHook(() => useLiveWorkCase(), {
      wrapper: wrapperFor(urlCase),
    });

    expect(result.current.slug).toBe("url");
    await waitFor(() => {
      expect(listCases).toHaveBeenCalled();
    });
    expect(result.current.slug).toBe("url");
  });

  it("reads an edit of that Case live from the list", async () => {
    const stale = buildCaseRecord({
      allowedEgress: ["local", "target", "model"],
    });
    listCases.mockResolvedValue(
      casePage([{ ...stale, allowedEgress: ["local", "target"] }])
    );

    const { result } = renderHook(() => useLiveWorkCase(), {
      wrapper: wrapperFor(stale),
    });

    await waitFor(() => {
      expect(result.current.allowedEgress).toEqual(["local", "target"]);
    });
  });
});

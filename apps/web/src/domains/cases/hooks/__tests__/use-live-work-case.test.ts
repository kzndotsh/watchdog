import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/domains/cases/cases.functions", () => ({
  getCasesContextFn: vi.fn(),
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
}));

import { getCasesContextFn } from "@/domains/cases/cases.functions";
import { useLiveWorkCase } from "@/domains/cases/hooks/use-live-work-case";
import { RouteCaseContext, useWorkCase } from "@/shared/hooks/use-route-case";
import { buildCaseRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";

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
  it("fails loudly instead of falling back to the cookie's Case", () => {
    const cookieCase = buildCaseRecord({ slug: "cookie" });
    vi.mocked(getCasesContextFn).mockResolvedValue({
      cases: [cookieCase],
      active: cookieCase,
    });
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
  it("is the URL's Case, not the cookie's", async () => {
    const urlCase = buildCaseRecord({ slug: "url", name: "From the URL" });
    const cookieCase = buildCaseRecord({
      id: testCaseId(11),
      slug: "cookie",
    });
    vi.mocked(getCasesContextFn).mockResolvedValue({
      cases: [urlCase, cookieCase],
      active: cookieCase,
    });

    const { result } = renderHook(() => useLiveWorkCase(), {
      wrapper: wrapperFor(urlCase),
    });

    expect(result.current.slug).toBe("url");
    await waitFor(() => {
      expect(getCasesContextFn).toHaveBeenCalled();
    });
    expect(result.current.slug).toBe("url");
  });

  it("reads an edit of that Case live from the list", async () => {
    const stale = buildCaseRecord({ allowThirdPartyEgress: true });
    vi.mocked(getCasesContextFn).mockResolvedValue({
      cases: [{ ...stale, allowThirdPartyEgress: false }],
      active: null,
    });

    const { result } = renderHook(() => useLiveWorkCase(), {
      wrapper: wrapperFor(stale),
    });

    await waitFor(() => {
      expect(result.current.allowThirdPartyEgress).toBe(false);
    });
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LAST_CASE_STORAGE_KEY,
  readLastCaseId,
} from "@/domains/cases/lib/active-case";
import type { CaseRecord } from "@/domains/cases/types";
import { Toaster } from "@/shared/ui/toast";
import { asCaseId, type CaseId } from "@watchdog/domain/schemas/shared";

import {
  ACTIVE_CASE_SWITCH_ERROR,
  useSelectActiveCase,
} from "../use-select-active-case";

const ALPHA_ID = asCaseId("550e8400-e29b-41d4-a716-446655440000");
const BETA_ID = asCaseId("550e8400-e29b-41d4-a716-446655440001");

function caseRow(id: CaseId, slug: string): CaseRecord {
  return {
    id,
    name: slug,
    slug,
    description: null,
    allowedEgress: ["local", "target"],
  };
}

const alpha = caseRow(ALPHA_ID, "alpha");
const beta = caseRow(BETA_ID, "beta");
const cases = [alpha, beta];

function setup(
  options: Partial<Parameters<typeof useSelectActiveCase>[0]> = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const hook = renderHook(() => useSelectActiveCase({ cases, ...options }), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <Toaster />
        {children}
      </QueryClientProvider>
    ),
  });
  return { queryClient, ...hook };
}

describe("useSelectActiveCase", () => {
  afterEach(() => {
    window.localStorage.removeItem(LAST_CASE_STORAGE_KEY);
  });

  it("remembers the Case as the last one entered, with no server write, on a Case-less screen", async () => {
    const navigate = vi.fn();
    const { result } = setup({ navigate, pathname: "/" });

    await act(async () => {
      await result.current.mutateAsync(BETA_ID);
    });

    expect(readLastCaseId()).toBe(BETA_ID);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("moves a Case URL to the same screen of the new Case", async () => {
    const navigate = vi.fn();
    const { result } = setup({ navigate, pathname: "/cases/alpha" });

    await act(async () => {
      await result.current.mutateAsync(BETA_ID);
    });

    expect(navigate).toHaveBeenCalledWith({
      to: "/cases/$caseSlug",
      params: { caseSlug: "beta" },
      replace: true,
    });
  });

  it("navigates to the Case Overview when asked", async () => {
    const navigate = vi.fn();
    const { result } = setup({ navigate, shouldNavigateToOverview: true });

    await act(async () => {
      await result.current.mutateAsync(BETA_ID);
    });

    expect(navigate).toHaveBeenCalledWith({
      to: "/cases/$caseSlug",
      params: { caseSlug: "beta" },
    });
  });

  it("says why for a Case it does not know, and remembers nothing", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current
        .mutateAsync(asCaseId("550e8400-e29b-41d4-a716-446655440009"))
        .catch(() => undefined);
    });

    expect(await screen.findByText("Case not found")).toBeInTheDocument();
    expect(readLastCaseId()).toBeNull();
  });

  it("exports the one error copy", () => {
    expect(ACTIVE_CASE_SWITCH_ERROR).toBe("Couldn't switch Case.");
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { casesKeys } from "@/domains/cases/queries";
import type { CaseRecord, CasesContext } from "@/domains/cases/types";
import { Toaster } from "@/shared/ui/toast";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

const setActiveCaseIdFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/cases/cases.functions", () => ({
  setActiveCaseIdFn,
}));

import {
  ACTIVE_CASE_SWITCH_ERROR,
  useSelectActiveCase,
} from "../use-select-active-case";

const ALPHA_ID = "550e8400-e29b-41d4-a716-446655440000";
const BETA_ID = "550e8400-e29b-41d4-a716-446655440001";

function caseRow(id: string, slug: string): CaseRecord {
  return {
    id,
    name: slug,
    slug,
    description: null,
    allowThirdPartyEgress: false,
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
  const context: CasesContext = { cases, active: alpha };
  queryClient.setQueryData(casesKeys.context(), context);
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
  it("switches the Active Case in the cache and invalidates the Case queries", async () => {
    setActiveCaseIdFn.mockResolvedValueOnce(BETA_ID);
    const { queryClient, result } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await result.current.mutateAsync(BETA_ID);
    });

    expect(setActiveCaseIdFn).toHaveBeenCalledWith({
      data: { caseId: BETA_ID },
    });
    expect(
      queryClient.getQueryData<CasesContext>(casesKeys.context())?.active
    ).toEqual(beta);
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: casesKeys.all })
    );
  });

  it("navigates to the Case Overview when asked", async () => {
    setActiveCaseIdFn.mockResolvedValueOnce(BETA_ID);
    const navigate = vi.fn();
    const { result } = setup({ navigate, navigateToOverview: true });

    await act(async () => {
      await result.current.mutateAsync(BETA_ID);
    });

    expect(navigate).toHaveBeenCalledWith({
      to: "/cases/$caseSlug",
      params: { caseSlug: "beta" },
    });
  });

  it("rolls the Active Case back and says Couldn't switch Case on a server failure", async () => {
    setActiveCaseIdFn.mockRejectedValueOnce(
      Object.assign(new Error("Internal server error"), { status: 500 })
    );
    const { queryClient, result } = setup();

    await act(async () => {
      await result.current.mutateAsync(BETA_ID).catch(() => undefined);
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<CasesContext>(casesKeys.context())?.active
      ).toEqual(alpha);
    });
    expect(
      await screen.findByText("Couldn't switch Case. Try again.")
    ).toBeInTheDocument();
  });

  it("shows the server's own message for a non-500 failure", async () => {
    setActiveCaseIdFn.mockRejectedValueOnce(new Error("Case not found"));
    const { result } = setup();

    await act(async () => {
      await result.current.mutateAsync(BETA_ID).catch(() => undefined);
    });

    expect(await screen.findByText("Case not found")).toBeInTheDocument();
  });

  it("exports the one error copy", () => {
    expect(ACTIVE_CASE_SWITCH_ERROR).toBe("Couldn't switch Case.");
  });
});

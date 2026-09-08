import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

vi.mock("@/shared/ui/shadcn/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@/domains/cases/components/case-overview-tab", () => ({
  CaseOverviewTab: () => <div>Overview tab body</div>,
}));

vi.mock("@/domains/cases/components/delete-case-dialog", () => ({
  DeleteCaseDialog: () => null,
}));

vi.mock("@/domains/cases/cases.functions", () => ({
  setActiveCaseIdFn: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  bindCasesChangedInvalidation: vi.fn(),
  invalidateAfterCaseSwitch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/domains/cases/lib/active-case", () => ({
  notifyCasesChanged: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

const useQueriesMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());

function queryLoaded<T>(data: T) {
  return {
    data,
    isFetched: true,
    isLoading: false,
    isError: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  };
}

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueries: (options: { queries: unknown[] }) => useQueriesMock(options),
    useQuery: (...args: unknown[]) => useQueryMock(...args),
    useMutation: (...args: unknown[]) => useMutationMock(...args),
  };
});

import { CaseOverview } from "@/domains/cases/components/case-overview";

const CASE: CaseRecord = {
  id: "case-1",
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

function renderOverview(activeId: string | null) {
  useQueriesMock.mockReturnValue([
    queryLoaded(CASE),
    queryLoaded({ cases: [CASE], active: activeId ? CASE : null }),
  ]);
  useQueryMock
    .mockReturnValueOnce({
      data: [],
      isFetched: true,
      isError: false,
      isLoading: false,
      isPlaceholderData: false,
    })
    .mockReturnValueOnce({
      data: [],
      isFetched: true,
      isError: false,
      isLoading: false,
      isPlaceholderData: false,
    });
  useMutationMock.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  });

  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <CaseOverview caseId={CASE.id} />
    </QueryClientProvider>
  );
}

describe("CaseOverview", () => {
  it("shows the active chip when this case is active", () => {
    renderOverview(CASE.id);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Overview tab body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Set Active" })
    ).not.toBeInTheDocument();
    expect(useQueriesMock).toHaveBeenCalled();
    expect(useMutationMock).toHaveBeenCalled();
  });

  it("offers Set Active when this case is not the active case", () => {
    renderOverview(null);
    expect(
      screen.getByRole("button", { name: "Set Active" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.getByText("Overview tab body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(useQueryMock).toHaveBeenCalled();
  });

  it("shows a retryable error when entity or identifier lists fail", () => {
    useQueriesMock.mockReturnValue([
      queryLoaded(CASE),
      queryLoaded({ cases: [CASE], active: CASE }),
    ]);
    useQueryMock
      .mockReturnValueOnce({
        data: undefined,
        isFetched: true,
        isError: true,
        error: new Error("entities unavailable"),
        isLoading: false,
        isPlaceholderData: false,
        refetch: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [],
        isFetched: true,
        isError: false,
        isLoading: false,
        isPlaceholderData: false,
        refetch: vi.fn(),
      });
    useMutationMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });

    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <CaseOverview caseId={CASE.id} />
      </QueryClientProvider>
    );

    expect(screen.getByText("entities unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("Overview tab body")).not.toBeInTheDocument();
  });
});

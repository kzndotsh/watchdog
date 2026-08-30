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

const useSuspenseQueryMock = vi.hoisted(() => vi.fn());
const useSuspenseQueriesMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useSuspenseQuery: (...args: unknown[]) => useSuspenseQueryMock(...args),
    useSuspenseQueries: (options: { queries: unknown[] }) =>
      useSuspenseQueriesMock(options),
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
  useSuspenseQueriesMock.mockReturnValue([
    { data: CASE },
    { data: { cases: [CASE], active: activeId ? CASE : null } },
  ]);
  useQueryMock
    .mockReturnValueOnce({ data: [], isPending: false })
    .mockReturnValueOnce({ data: [], isPending: false });
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
    expect(useSuspenseQueriesMock).toHaveBeenCalled();
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
});

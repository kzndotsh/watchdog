import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
    useMutation: (...args: unknown[]) => useMutationMock(...args),
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/domains/cases/cases.functions", () => ({
  createCaseFn: vi.fn(),
  setActiveCaseIdFn: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterCaseSwitch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/domains/cases/lib/active-case", () => ({
  notifyCasesChanged: vi.fn(),
}));

import { CaseList } from "@/domains/cases/components/case-list";

const CASE_A: CaseRecord = {
  id: "case-a",
  slug: "alpha",
  name: "Alpha",
  description: "First case",
  allowThirdPartyEgress: false,
};

const CASE_B: CaseRecord = {
  id: "case-b",
  slug: "beta",
  name: "Beta",
  description: null,
  allowThirdPartyEgress: true,
};

function renderCaseList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CaseList />
    </QueryClientProvider>
  );
}

function casesQueryResult(data: {
  cases: CaseRecord[];
  active: CaseRecord | null;
}) {
  return {
    data,
    isFetched: true,
    isLoading: false,
    isError: false,
  };
}

describe("CaseList", () => {
  it("renders case cards with the active case marked", () => {
    useQueryMock.mockReturnValue(
      casesQueryResult({ cases: [CASE_B, CASE_A], active: CASE_A })
    );
    useMutationMock.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    });

    renderCaseList();

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("First case")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Open" }).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.queryByRole("button", { name: "Select" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Active" })
    ).not.toBeInTheDocument();
  });

  it("shows a no-results empty state when search matches nothing", async () => {
    useQueryMock.mockReturnValue(
      casesQueryResult({ cases: [CASE_A], active: CASE_A })
    );
    useMutationMock.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    });

    renderCaseList();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Search cases" }),
      "missing"
    );

    expect(screen.getByText(/No cases Match/i)).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search cases" })).toHaveValue(
      "missing"
    );
  });
});

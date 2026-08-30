// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

vi.mock("@/shared/ui/shadcn/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  Navigate: () => null,
}));

vi.mock("@/domains/triage/components/triage-detail", () => ({
  TriageDetail: () => <div>Triage detail panel</div>,
}));

vi.mock("@/domains/triage/components/triage-queue-list", () => ({
  TriageQueueList: () => <div>Triage queue list</div>,
}));

vi.mock("@/domains/triage/components/triage-queue-toolbar", () => ({
  TriageQueueToolbar: () => <div>Triage queue toolbar</div>,
}));

vi.mock("@/shared/ui/split-view", () => ({
  SplitView: ({
    list,
    detail,
  }: {
    list: React.ReactNode;
    detail: React.ReactNode;
  }) => (
    <div>
      <div data-testid="split-list">{list}</div>
      <div data-testid="split-detail">{detail}</div>
    </div>
  ),
}));

const useSuspenseQueryMock = vi.hoisted(() => vi.fn());
const useSuspenseQueriesMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());
const useTriageWorkspaceMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useSuspenseQuery: (...args: unknown[]) => useSuspenseQueryMock(...args),
    useSuspenseQueries: (options: { queries: unknown[] }) =>
      useSuspenseQueriesMock(options),
    useQuery: (...args: unknown[]) => useQueryMock(...args),
  };
});

vi.mock("@/domains/triage/hooks/use-triage-workspace", () => ({
  useTriageWorkspace: (...args: unknown[]) => useTriageWorkspaceMock(...args),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  bindCasesChangedInvalidation: vi.fn(),
}));

import { Triage } from "@/domains/triage/components/triage";

const ACTIVE: CaseRecord = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

function mockWorkspace() {
  useTriageWorkspaceMock.mockReturnValue({
    allProposals: [{ id: testId(50) }],
    rows: [{ id: testId(50) }],
    filters: { q: "", statuses: ["pending"] },
    setFilters: vi.fn(),
    pendingCount: 1,
    selectedId: testId(50),
    selected: { id: testId(50) },
    error: null,
    pending: false,
    selectionOutOfSync: false,
    handleAccept: vi.fn(),
    handleReject: vi.fn(),
  });
}

describe("Triage", () => {
  it("prompts for an active case when none is selected", () => {
    useSuspenseQueriesMock.mockReturnValue([
      { data: { cases: [], active: null } },
    ]);

    render(<Triage onProposalIdChange={vi.fn()} />);
    expect(screen.getByText("No Active Case")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Select a Case" })).toHaveAttribute(
      "href",
      "/cases"
    );
    expect(screen.queryByText("Triage queue toolbar")).not.toBeInTheDocument();
    expect(useSuspenseQueriesMock).toHaveBeenCalled();
  });

  it("renders queue chrome for the active case", () => {
    useSuspenseQueriesMock.mockReturnValue([
      { data: { cases: [ACTIVE], active: ACTIVE } },
    ]);
    useQueryMock.mockReturnValue({ data: 1, isPending: false });
    mockWorkspace();

    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <Triage proposalId={testId(50)} onProposalIdChange={vi.fn()} />
      </QueryClientProvider>
    );

    expect(screen.getByText("Triage queue toolbar")).toBeInTheDocument();
    expect(screen.getByText("Triage queue list")).toBeInTheDocument();
    expect(screen.getByText("Triage detail panel")).toBeInTheDocument();
    expect(screen.getByTestId("split-list")).toBeInTheDocument();
    expect(screen.getByTestId("split-detail")).toBeInTheDocument();
    expect(useTriageWorkspaceMock).toHaveBeenCalled();
    expect(useSuspenseQueriesMock).toHaveBeenCalled();
  });
});

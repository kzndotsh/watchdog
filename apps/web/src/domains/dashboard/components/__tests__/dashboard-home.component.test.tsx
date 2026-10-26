import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testCaseId } from "@watchdog/schemas/testing";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

vi.mock("@watchdog/ui/components/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@/shared/hooks/use-hydrated", () => ({
  useHydrated: () => false,
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterJobMutation: vi.fn(),
  invalidateAfterProposalQueueChange: vi.fn(),
  invalidateAfterTaskMutation: vi.fn(),
}));

vi.mock("@/domains/dashboard/components/recent-activity", () => ({
  RecentActivity: () => <div>Recent activity panel</div>,
}));

const useCasesContextMock = vi.hoisted(() => vi.fn());

const fns = vi.hoisted(() => ({
  getCaseCountsFn: vi.fn(),
  listProposalQueuePageFn: vi.fn(),
  getDueTasksFn: vi.fn(),
  // The whole-list reads the tiles used to count: any call fails the test.
  listJobsFn: vi.fn(),
  listEntitiesFn: vi.fn(),
}));

vi.mock("@/domains/cases/cases.functions", () => ({
  getCaseCountsFn: fns.getCaseCountsFn,
}));
vi.mock("@/domains/triage/triage.functions", () => ({
  listProposalQueuePageFn: fns.listProposalQueuePageFn,
}));
vi.mock("@/domains/tasks/tasks.functions", () => ({
  getDueTasksFn: fns.getDueTasksFn,
}));
vi.mock("@/domains/jobs/jobs.functions", () => ({
  listJobsFn: fns.listJobsFn,
}));
vi.mock("@/domains/entities/entities.functions", () => ({
  listEntitiesFn: fns.listEntitiesFn,
}));

vi.mock("@/domains/cases/hooks/use-cases-context", () => ({
  useCasesContext: () => useCasesContextMock(),
}));

import { DashboardHome } from "@/domains/dashboard/components/dashboard-home";

function renderDashboard(active: null | { id: string }) {
  useCasesContextMock.mockReturnValue({
    casesCtx: {
      cases: active ? [{ id: active.id, slug: "alpha", name: "Alpha" }] : [],
      active,
    },
    cases: active ? [{ id: active.id, slug: "alpha", name: "Alpha" }] : [],
    active,
    pending: false,
    loadError: null,
    retry: vi.fn(),
    placeholder: false,
  });

  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <DashboardHome />
    </QueryClientProvider>
  );
}

describe("DashboardHome", () => {
  it("shows idle triage and due-task placeholders without an active case", () => {
    renderDashboard(null);
    expect(
      screen.getByText(/Select a Case in the sidebar to see pending proposals/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Overdue and near-due tasks show up once a Case is active/
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Recent activity panel")).toBeInTheDocument();
    expect(
      screen.getByText(/Select a Case in the sidebar to see pending proposals/)
    ).toBeVisible();
    expect(useCasesContextMock).toHaveBeenCalled();
  });
});

const exact = (count: number) => ({ count, isCapped: false });

describe("DashboardHome tiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fns.getCaseCountsFn.mockResolvedValue({
      entities: { count: 1000, isCapped: true },
      identifiers: exact(0),
      connections: exact(0),
      evidence: exact(0),
      liveJobs: exact(4),
      tasksOverdue: exact(2),
      tasksDueSoon: exact(6),
    });
    fns.listProposalQueuePageFn.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: exact(3),
    });
    fns.getDueTasksFn.mockResolvedValue({
      items: [],
      total: { count: 0, isCapped: false },
    });
  });

  it("reads the tile counts from one counts request, not from whole lists", async () => {
    renderDashboard({ id: testCaseId(1) });

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /Tasks overdue/ })
      ).toHaveTextContent("2");
    });
    expect(
      screen.getByRole("link", { name: /Tasks due soon/ })
    ).toHaveTextContent("6");
    expect(
      screen.getByRole("link", { name: /Jobs running/ })
    ).toHaveTextContent("4");
    expect(screen.getByRole("link", { name: /Entities/ })).toHaveTextContent(
      "1000+"
    );
    expect(
      screen.getByRole("link", { name: /Proposals pending/ })
    ).toHaveTextContent("3");
    expect(fns.getCaseCountsFn).toHaveBeenCalledTimes(1);
    expect(fns.listJobsFn).not.toHaveBeenCalled();
    expect(fns.listEntitiesFn).not.toHaveBeenCalled();
  });

  it("reads the due list once, on the same day as the counts", async () => {
    renderDashboard({ id: testCaseId(1) });

    await waitFor(() => {
      expect(fns.getDueTasksFn).toHaveBeenCalledTimes(1);
    });
    const counts = fns.getCaseCountsFn.mock.lastCall?.[0];
    expect(fns.getDueTasksFn).toHaveBeenCalledWith(counts);
  });
});

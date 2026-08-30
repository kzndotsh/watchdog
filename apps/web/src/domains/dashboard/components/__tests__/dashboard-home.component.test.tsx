import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

vi.mock("@/shared/ui/shadcn/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@/shared/hooks/use-hydrated", () => ({
  useHydrated: () => false,
}));

vi.mock("@/shared/hooks/use-live-events", () => ({
  useLiveEvents: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  bindCasesChangedInvalidation: vi.fn(),
  invalidateAfterJobMutation: vi.fn(),
  invalidateAfterProposalQueueChange: vi.fn(),
  invalidateAfterTaskMutation: vi.fn(),
}));

vi.mock("@/domains/dashboard/components/recent-activity", () => ({
  RecentActivity: () => <div>Recent activity panel</div>,
}));

const useSuspenseQueryMock = vi.hoisted(() => vi.fn());
const useSuspenseQueriesMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useSuspenseQuery: (...args: unknown[]) => useSuspenseQueryMock(...args),
    useSuspenseQueries: (options: { queries: unknown[] }) =>
      useSuspenseQueriesMock(options),
  };
});

import { DashboardHome } from "@/domains/dashboard/components/dashboard-home";

function renderDashboard(active: null | { id: string }) {
  useSuspenseQueriesMock.mockReturnValue([
    {
      data: {
        cases: active ? [{ id: active.id, slug: "alpha", name: "Alpha" }] : [],
        active,
      },
    },
  ]);

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
    expect(useSuspenseQueriesMock).toHaveBeenCalled();
  });
});

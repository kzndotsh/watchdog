import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActivityItem } from "@/domains/activity/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/domains/activity/queries", () => ({
  recentActivityQuery: () => ({ queryKey: ["activity", "recent"] }),
}));

const activityState = vi.hoisted(() => ({
  items: [] as ActivityItem[],
}));

vi.mock("@tanstack/react-query", () => ({
  useSuspenseQuery: () => ({
    data: activityState.items,
    isFetching: false,
  }),
  Suspense: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { RecentActivity } from "../recent-activity";

describe("RecentActivity", () => {
  beforeEach(() => {
    activityState.items = [];
  });

  it("renders activity section header", () => {
    render(<RecentActivity cases={[]} />);

    expect(screen.getByLabelText(/recent activity/i)).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });

  it("shows actor labels on activity rows", () => {
    activityState.items = [
      {
        id: testId(11),
        kind: "job",
        action: "Queued",
        caseId: testId(10),
        caseName: "Ada",
        label: "dns",
        at: "2026-01-01T00:00:00.000Z",
        actor: "ada",
      },
    ];

    render(<RecentActivity cases={[]} />);

    expect(screen.getByText("ada")).toBeInTheDocument();
    expect(screen.getByText("By")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActivityItem } from "@watchdog/schemas/feed";
import { testCaseId } from "@watchdog/schemas/testing";
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
  isError: false,
  isLoading: false,
  isFetched: true,
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: () => ({
      data: activityState.items,
      isFetched: activityState.isFetched,
      isLoading: activityState.isLoading,
      isError: activityState.isError,
      error: activityState.isError ? new Error("activity failed") : undefined,
      isPlaceholderData: false,
      refetch: vi.fn(),
    }),
  };
});

import { RecentActivity } from "../recent-activity";

describe("RecentActivity", () => {
  beforeEach(() => {
    activityState.items = [];
    activityState.isError = false;
    activityState.isLoading = false;
    activityState.isFetched = true;
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
        caseId: testCaseId(10),
        caseName: "Ada",
        label: "dns",
        at: "2026-01-01T00:00:00.000Z",
        actor: "ada",
      },
    ];

    render(<RecentActivity cases={[]} />);

    expect(screen.getByText("Job")).toBeInTheDocument();
    expect(screen.getByText("ada")).toBeInTheDocument();
    expect(screen.getByText("By")).toBeInTheDocument();
  });

  it("opens no live connection of its own: the shell owns the one activity stream", () => {
    const eventSource = vi.fn();
    vi.stubGlobal("EventSource", eventSource);
    try {
      const cases = Array.from({ length: 5 }, (_, index) => ({
        id: testCaseId(20 + index),
        name: `Case ${index}`,
        slug: `case-${index}`,
        description: null,
        allowThirdPartyEgress: false,
      }));
      render(<RecentActivity cases={cases} />);
      expect(eventSource).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows Proposal history: proposed, then the decision with its transition", () => {
    activityState.items = [
      {
        id: "12",
        kind: "proposal",
        action: "Accepted",
        caseId: testCaseId(10),
        caseName: "Ada",
        label: "Registrar is Acme",
        status: "accepted",
        fromStatus: "pending",
        toStatus: "accepted",
        at: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "11",
        kind: "proposal",
        action: "Proposed",
        caseId: testCaseId(10),
        caseName: "Ada",
        label: "Registrar is Acme",
        status: "pending",
        at: "2026-01-01T00:00:00.000Z",
      },
    ];

    render(<RecentActivity cases={[]} />);

    const [decided, proposed] = screen.getAllByRole("listitem");
    expect(decided).toHaveTextContent("ProposalAccepted");
    expect(decided).toHaveTextContent("Registrar is Acme");
    expect(proposed).toHaveTextContent("ProposalProposed");
    expect(proposed).toHaveTextContent("Registrar is Acme");
  });

  it("shows a captured Evidence row", () => {
    activityState.items = [
      {
        id: "7",
        kind: "evidence",
        action: "Captured",
        caseId: testCaseId(10),
        caseName: "Ada",
        label: "photo.png",
        at: "2026-01-01T00:00:00.000Z",
        actor: "ada",
      },
    ];

    render(<RecentActivity cases={[]} />);

    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(screen.getByText("Captured")).toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
  });

  it("shows a retryable error when activity fails to load", () => {
    activityState.isError = true;
    activityState.isFetched = true;
    activityState.isLoading = false;

    render(<RecentActivity cases={[]} />);

    expect(screen.getByText("activity failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

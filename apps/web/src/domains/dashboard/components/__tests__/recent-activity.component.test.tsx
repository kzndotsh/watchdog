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

vi.mock("@/shared/hooks/use-live-events", () => ({
  useLiveEvents: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn(),
  invalidateAfterEvidenceMutation: vi.fn(),
  invalidateAfterJobMutation: vi.fn(),
  invalidateAfterProposalQueueChange: vi.fn(),
  invalidateAfterTaskMutation: vi.fn(),
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
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
      refetchQueries: vi.fn(),
    }),
  };
});

import { useLiveEvents } from "@/shared/hooks/use-live-events";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";

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
        caseId: testId(10),
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

  it("invalidates activity on entity_changed live events", () => {
    const caseId = testId(10);
    render(
      <RecentActivity
        cases={[
          {
            id: caseId,
            name: "Ada",
            slug: "ada",
            description: null,
            allowThirdPartyEgress: false,
          },
        ]}
      />
    );

    const onEvent = vi.mocked(useLiveEvents).mock.calls[0]?.[1];
    expect(onEvent).toBeTypeOf("function");
    onEvent?.({
      type: "entity_changed",
      caseId,
    });

    expect(invalidateAfterEntityChanged).toHaveBeenCalledWith(
      expect.anything(),
      caseId
    );
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

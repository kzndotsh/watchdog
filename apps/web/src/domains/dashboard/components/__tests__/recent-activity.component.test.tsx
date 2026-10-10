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

/** The filter each committed render asked the activity query for. */
const askedFilters = vi.hoisted(() => [] as ({ caseId: string } | undefined)[]);

vi.mock("@/domains/activity/queries", () => ({
  recentActivityQuery: (filter?: { caseId: string }) => {
    askedFilters.push(filter);
    return { queryKey: ["activity", "recent"] };
  },
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

  describe("case filter", () => {
    const caseA = {
      id: testCaseId(20),
      name: "Case A",
      slug: "case-a",
      description: null,
      allowThirdPartyEgress: false,
    };
    const caseB = { ...caseA, id: testCaseId(21), name: "Case B", slug: "b" };

    it("filters by the Case in the URL", () => {
      askedFilters.length = 0;
      render(
        <RecentActivity
          cases={[caseA, caseB]}
          activityCaseId={caseB.id}
          onActivityCaseChange={vi.fn()}
        />
      );
      expect(askedFilters.at(-1)).toEqual({ caseId: caseB.id });
    });

    it("never filters by a Case that is gone, not even for one render", () => {
      const props = { onActivityCaseChange: vi.fn() };
      const view = render(
        <RecentActivity
          cases={[caseA, caseB]}
          activityCaseId={caseA.id}
          {...props}
        />
      );
      askedFilters.length = 0;

      view.rerender(
        <RecentActivity cases={[caseB]} activityCaseId={caseA.id} {...props} />
      );

      expect(askedFilters.length).toBeGreaterThan(0);
      for (const filter of askedFilters) expect(filter).toBeUndefined();
      expect(
        screen.getByRole("combobox", { name: /filter activity by case/i })
      ).toHaveTextContent("All cases");
    });

    it("filters by the Case again if it becomes visible again (the URL id is left alone)", () => {
      const props = { onActivityCaseChange: vi.fn() };
      const view = render(
        <RecentActivity cases={[caseB]} activityCaseId={caseA.id} {...props} />
      );
      expect(askedFilters.at(-1)).toBeUndefined();

      view.rerender(
        <RecentActivity
          cases={[caseA, caseB]}
          activityCaseId={caseA.id}
          {...props}
        />
      );

      expect(askedFilters.at(-1)).toEqual({ caseId: caseA.id });
      expect(props.onActivityCaseChange).not.toHaveBeenCalled();
    });
  });
});

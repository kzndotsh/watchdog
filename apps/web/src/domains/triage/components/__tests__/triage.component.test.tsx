// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import type { TriageQueueFilters } from "@/domains/triage/lib/filters";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

vi.mock("@watchdog/ui/components/sidebar", () => ({
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

/** The status facet the toolbar showed on each committed render. */
const committedFacets = vi.hoisted(() => [] as string[]);

vi.mock("@/domains/triage/components/triage-queue-toolbar", () => ({
  TriageQueueToolbar: ({ filters }: { filters: TriageQueueFilters }) => {
    useLayoutEffect(() => {
      committedFacets.push(filters.statuses.join(","));
    });
    return <div>Triage queue toolbar</div>;
  },
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

const useCasesContextMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());
type WorkspaceOptions = {
  filters: TriageQueueFilters;
  onFiltersChange: (next: TriageQueueFilters) => void;
};
const useTriageWorkspaceMock = vi.hoisted(() =>
  vi.fn<(caseId: string, options: WorkspaceOptions) => unknown>()
);

function mockCasesContextLoaded(
  active: CaseRecord | null,
  cases: CaseRecord[] = active ? [active] : []
) {
  useCasesContextMock.mockReturnValue({
    casesCtx: { cases, active },
    cases,
    active,
    pending: false,
    loadError: null,
    retry: vi.fn(),
    placeholder: false,
  });
}

vi.mock("@/domains/cases/hooks/use-cases-context", () => ({
  useCasesContext: () => useCasesContextMock(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
  };
});

vi.mock("@/domains/triage/hooks/use-triage-workspace", () => ({
  useTriageWorkspace: (caseId: string, options: WorkspaceOptions) =>
    useTriageWorkspaceMock(caseId, options),
}));

import { Triage } from "@/domains/triage/components/triage";

const ACTIVE: CaseRecord = {
  id: testCaseId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

function mockWorkspace() {
  useTriageWorkspaceMock.mockReturnValue({
    allProposals: [{ id: testId(50) }],
    proposalsPlaceholder: false,
    proposalsPending: false,
    proposalsLoadError: null,
    handleRetryProposals: vi.fn(),
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
    mockCasesContextLoaded(null);

    render(<Triage onProposalIdChange={vi.fn()} />);
    expect(screen.getByText("No Active Case")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Select a Case" })).toHaveAttribute(
      "href",
      "/cases"
    );
    expect(screen.queryByText("Triage queue toolbar")).not.toBeInTheDocument();
    expect(useCasesContextMock).toHaveBeenCalled();
  });

  it("renders queue chrome for the active case", () => {
    mockCasesContextLoaded(ACTIVE);
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
    expect(useCasesContextMock).toHaveBeenCalled();
  });

  describe("status filter", () => {
    function renderTriage(initialStatus?: "pending" | "rejected") {
      mockCasesContextLoaded(ACTIVE);
      mockWorkspace();
      useTriageWorkspaceMock.mockClear();
      const onStatusSearchChange = vi.fn();
      const ui = (status?: "pending" | "rejected") => (
        <QueryClientProvider client={new QueryClient()}>
          <Triage
            initialStatus={status}
            onProposalIdChange={vi.fn()}
            onStatusSearchChange={onStatusSearchChange}
          />
        </QueryClientProvider>
      );
      const view = render(ui(initialStatus));
      return {
        onStatusSearchChange,
        switchTo: (status?: "pending" | "rejected") => {
          committedFacets.length = 0;
          view.rerender(ui(status));
        },
      };
    }

    function latestWorkspaceOptions(): WorkspaceOptions {
      const call = useTriageWorkspaceMock.mock.calls.at(-1);
      if (!call) throw new Error("the workspace was never asked for");
      return call[1];
    }

    it("seeds the queue from the status in the URL", () => {
      renderTriage("rejected");
      expect(latestWorkspaceOptions().filters.statuses).toEqual(["rejected"]);
    });

    it("follows an external status change on the first render, never showing the old facet", () => {
      const { switchTo } = renderTriage("rejected");

      switchTo(undefined);

      expect(committedFacets).toEqual(["pending"]);
    });

    it("keeps the search text when the status in the URL changes", () => {
      const { switchTo } = renderTriage("pending");
      const options = latestWorkspaceOptions();
      act(() => {
        options.onFiltersChange({ q: "needle", statuses: ["pending"] });
      });

      switchTo("rejected");

      expect(latestWorkspaceOptions().filters).toEqual({
        q: "needle",
        statuses: ["rejected"],
      });
    });

    it("keeps a status added on top of the one in the URL when the URL then loses its status", () => {
      const { switchTo } = renderTriage("rejected");
      const options = latestWorkspaceOptions();
      act(() => {
        options.onFiltersChange({ q: "", statuses: ["rejected", "pending"] });
      });

      // The URL cannot say "two statuses", so it drops `?status=`.
      switchTo(undefined);

      expect(committedFacets).toEqual(["rejected,pending"]);
      expect(latestWorkspaceOptions().filters.statuses).toEqual([
        "rejected",
        "pending",
      ]);
    });

    it("keeps an emptied facet when the URL loses its status", () => {
      const { switchTo } = renderTriage("rejected");
      act(() => {
        latestWorkspaceOptions().onFiltersChange({ q: "", statuses: [] });
      });

      switchTo(undefined);

      expect(committedFacets).toEqual([""]);
    });

    it("keeps a multi-status choice the URL cannot express, and mirrors the single case to the URL", () => {
      const { onStatusSearchChange } = renderTriage();
      const options = latestWorkspaceOptions();

      act(() => {
        options.onFiltersChange({ q: "", statuses: ["pending", "rejected"] });
      });
      expect(latestWorkspaceOptions().filters.statuses).toEqual([
        "pending",
        "rejected",
      ]);
      expect(onStatusSearchChange).toHaveBeenLastCalledWith(undefined);

      act(() => {
        options.onFiltersChange({ q: "", statuses: ["rejected"] });
      });
      expect(onStatusSearchChange).toHaveBeenLastCalledWith("rejected");
    });
  });
});

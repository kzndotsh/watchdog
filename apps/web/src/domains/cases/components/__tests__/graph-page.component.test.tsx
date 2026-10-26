import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
}));

const useCasesContextMock = vi.hoisted(() => vi.fn());

vi.mock("@/domains/cases/hooks/use-cases-context", () => ({
  useCasesContext: () => useCasesContextMock(),
}));

const fns = vi.hoisted(() => ({
  getGraphSnapshotFn: vi.fn(),
  getCaseCountsFn: vi.fn(),
}));

vi.mock("@/domains/entities/edges/edges.functions", () => ({
  getGraphSnapshotFn: fns.getGraphSnapshotFn,
}));
vi.mock("@/domains/cases/cases.functions", () => ({
  getCaseCountsFn: fns.getCaseCountsFn,
}));

// React Flow needs a laid-out DOM; the canvas has its own tests. This one shows what it was given.
vi.mock("@/domains/cases/components/case-graph/case-graph-canvas", () => ({
  CaseGraphCanvas: ({
    entities,
    edges,
  }: {
    entities: readonly unknown[];
    edges: readonly unknown[];
  }) => (
    <div>
      Graph canvas: {entities.length} entities, {edges.length} connections
    </div>
  ),
}));

import { GraphPage } from "@/domains/cases/components/graph-page";
import type { CaseCounts, CaseRecord } from "@/domains/cases/types";
import type { GraphSnapshot } from "@/domains/entities/edges/types";
import { renderIn } from "@/testing/render-in-case";

const CASE: CaseRecord = {
  id: testCaseId(1),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

const render = renderIn(CASE);

function snapshotOf(
  entityCount: number,
  edgeCount: number,
  isTruncated: boolean
): GraphSnapshot {
  const entities = Array.from({ length: entityCount }, (_, i) => ({
    id: testId(1000 + i),
    name: `Entity ${String(i)}`,
    slug: `entity-${String(i)}`,
    kind: "person" as const,
  }));
  const edges = Array.from({ length: edgeCount }, (_, i) => ({
    id: testId(5000 + i),
    fromId: testId(1000),
    toId: testId(1001),
    predicate: "associate_of" as const,
    confidence: "unverified" as const,
  }));
  return { entities, edges, isTruncated };
}

function countsOf(
  entities: CaseCounts["entities"],
  connections: CaseCounts["connections"]
): CaseCounts {
  const zero = { count: 0, isCapped: false };
  return {
    entities,
    identifiers: zero,
    connections,
    evidence: zero,
    liveJobs: zero,
    tasksOverdue: zero,
    tasksDueSoon: zero,
  };
}

function renderGraphPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GraphPage />
    </QueryClientProvider>
  );
}

describe("GraphPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCasesContextMock.mockReturnValue({
      casesCtx: { cases: [CASE], active: CASE },
      cases: [CASE],
      active: CASE,
      pending: false,
      loadError: null,
      retry: vi.fn(),
      placeholder: false,
    });
  });

  it("draws the snapshot from one request, with no notice when nothing was cut", async () => {
    fns.getGraphSnapshotFn.mockResolvedValue(snapshotOf(3, 2, false));

    renderGraphPage();

    expect(
      await screen.findByText("Graph canvas: 3 entities, 2 connections")
    ).toBeInTheDocument();
    expect(fns.getGraphSnapshotFn).toHaveBeenCalledTimes(1);
    expect(fns.getGraphSnapshotFn).toHaveBeenCalledWith({
      data: { caseId: CASE.id },
    });
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument();
    // The counts are only for the notice: no request when nothing was cut.
    expect(fns.getCaseCountsFn).not.toHaveBeenCalled();
  });

  it("says how many of the Case's Entities it shows when the server cut them", async () => {
    fns.getGraphSnapshotFn.mockResolvedValue(snapshotOf(150, 40, true));
    fns.getCaseCountsFn.mockResolvedValue(
      countsOf({ count: 1000, isCapped: true }, { count: 900, isCapped: false })
    );

    renderGraphPage();

    expect(
      await screen.findByText(
        "Showing 150 of 1,000+ entities, the most connected. Open an Entity's Connections to see the rest."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("Graph canvas: 150 entities, 40 connections")
    ).toBeInTheDocument();
    expect(fns.getCaseCountsFn).toHaveBeenCalledTimes(1);
  });

  it("names the Connections when only they were cut", async () => {
    fns.getGraphSnapshotFn.mockResolvedValue(snapshotOf(12, 600, true));
    fns.getCaseCountsFn.mockResolvedValue(
      countsOf({ count: 12, isCapped: false }, { count: 750, isCapped: false })
    );

    renderGraphPage();

    expect(
      await screen.findByText(
        "Showing 600 of 750 connections. Open an Entity's Connections to see the rest."
      )
    ).toBeInTheDocument();
  });

  it("shows a retryable error when the snapshot fails", async () => {
    fns.getGraphSnapshotFn.mockRejectedValueOnce(new Error("graph failed"));
    fns.getGraphSnapshotFn.mockResolvedValueOnce(snapshotOf(2, 1, false));

    renderGraphPage();

    expect(await screen.findByText("graph failed")).toBeInTheDocument();
    expect(screen.queryByText(/^Graph canvas/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("Graph canvas: 2 entities, 1 connections")
    ).toBeInTheDocument();
  });
});

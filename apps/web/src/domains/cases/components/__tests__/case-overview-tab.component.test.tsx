import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import { buildJobListRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode;
    to: string;
    params?: { caseSlug: string };
  }) => (
    <a href={to.replace("$caseSlug", params?.caseSlug ?? "")}>{children}</a>
  ),
}));

vi.mock("@/domains/cases/components/case-settings-form", () => ({
  CaseSettingsForm: () => <div>Case settings form</div>,
}));

const fns = vi.hoisted(() => ({
  getCaseCountsFn: vi.fn(),
  listEvidencePickerPageFn: vi.fn(),
  getEvidenceManyFn: vi.fn(),
  listRecentJobsFn: vi.fn(),
  listProposalQueuePageFn: vi.fn(),
  getEntitiesFn: vi.fn(),
  // The whole-list reads this screen no longer makes: any call fails the test.
  listEvidenceFn: vi.fn(),
  listJobsFn: vi.fn(),
  listEdgesForCaseFn: vi.fn(),
  listIdentifiersForCaseFn: vi.fn(),
}));

vi.mock("@/domains/cases/cases.functions", () => ({
  getCaseCountsFn: fns.getCaseCountsFn,
}));
vi.mock("@/domains/intake/intake.functions", () => ({
  listEvidencePickerPageFn: fns.listEvidencePickerPageFn,
  getEvidenceManyFn: fns.getEvidenceManyFn,
  listEvidenceFn: fns.listEvidenceFn,
}));
vi.mock("@/domains/jobs/jobs.functions", () => ({
  listRecentJobsFn: fns.listRecentJobsFn,
  listJobsFn: fns.listJobsFn,
}));
vi.mock("@/domains/triage/triage.functions", () => ({
  listProposalQueuePageFn: fns.listProposalQueuePageFn,
}));
vi.mock("@/domains/entities/entities.functions", () => ({
  getEntitiesFn: fns.getEntitiesFn,
}));
vi.mock("@/domains/entities/edges/edges.functions", () => ({
  listEdgesForCaseFn: fns.listEdgesForCaseFn,
}));

import { CaseOverviewTab } from "@/domains/cases/components/case-overview-tab";

const CASE: CaseRecord = {
  id: testCaseId(1),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

const exact = (count: number) => ({ count, isCapped: false });

const COUNTS = {
  entities: exact(12),
  identifiers: { count: 1000, isCapped: true },
  connections: exact(3),
  evidence: exact(40),
  liveJobs: exact(2),
  tasksOverdue: exact(0),
  tasksDueSoon: exact(0),
};

function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CaseOverviewTab caseId={CASE.id} caseRow={CASE} />
    </QueryClientProvider>
  );
}

describe("CaseOverviewTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fns.getCaseCountsFn.mockResolvedValue(COUNTS);
    fns.listEvidencePickerPageFn.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: exact(0),
    });
    fns.getEvidenceManyFn.mockResolvedValue([]);
    fns.getEntitiesFn.mockResolvedValue([]);
    fns.listRecentJobsFn.mockResolvedValue([]);
    fns.listProposalQueuePageFn.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: exact(5),
    });
  });

  it("renders the stat tiles from one counts request, capped counts as N+", async () => {
    renderTab();

    expect(
      await screen.findByRole("region", { name: "Case stats" })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Entities/ })).toHaveTextContent(
        "12"
      );
    });
    expect(screen.getByRole("link", { name: /Identifiers/ })).toHaveTextContent(
      "1000+"
    );
    expect(screen.getByRole("link", { name: /Connections/ })).toHaveTextContent(
      "3"
    );
    expect(screen.getByRole("link", { name: /Evidence/ })).toHaveTextContent(
      "40"
    );
    expect(screen.getByRole("link", { name: /Live jobs/ })).toHaveTextContent(
      "2"
    );
    expect(
      screen.getByRole("link", { name: /Pending proposals/ })
    ).toHaveTextContent("5");
    expect(screen.getByRole("link", { name: /Entities/ })).toHaveAttribute(
      "href",
      "/cases/alpha/entities"
    );
    expect(fns.getCaseCountsFn).toHaveBeenCalledTimes(1);
    expect(fns.getCaseCountsFn).toHaveBeenCalledWith({
      data: {
        caseId: CASE.id,
        dayStart: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
    });
  });

  it("reads one page of each recent list and never a whole list", async () => {
    renderTab();
    await screen.findByText("Nothing yet");

    expect(fns.listEvidencePickerPageFn).toHaveBeenCalledWith({
      data: { caseId: CASE.id, limit: 12 },
    });
    expect(fns.listProposalQueuePageFn).toHaveBeenCalledTimes(1);
    expect(fns.listRecentJobsFn).toHaveBeenCalledTimes(1);
    for (const whole of [
      fns.listEvidenceFn,
      fns.listJobsFn,
      fns.listEdgesForCaseFn,
      fns.listIdentifiersForCaseFn,
    ]) {
      expect(whole).not.toHaveBeenCalled();
    }
  });

  it("names the Entity a Job's input points at by reading it by id", async () => {
    const entityId = testId(30);
    fns.listRecentJobsFn.mockResolvedValue([
      buildJobListRecord({
        id: testId(31),
        capabilityId: "network.dns.lookup",
        input: { entityId },
        resultSummary: null,
      }),
    ]);
    fns.getEntitiesFn.mockResolvedValue([
      {
        id: entityId,
        name: "Acme Ltd",
        kind: "org",
        slug: "acme-ltd",
      },
    ]);
    renderTab();

    await waitFor(() => {
      expect(fns.getEntitiesFn).toHaveBeenCalledWith({
        data: { caseId: CASE.id, ids: [entityId] },
      });
    });
  });

  it("shows a blank activity slate when there is no recent activity", async () => {
    renderTab();
    expect(await screen.findByText("Nothing yet")).toBeInTheDocument();
    expect(screen.getByText("Case settings form")).toBeInTheDocument();
  });

  it("shows a retryable error when the counts fail to load", async () => {
    fns.getCaseCountsFn.mockRejectedValue(new Error("overview stats failed"));
    renderTab();

    expect(
      await screen.findByText("overview stats failed")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

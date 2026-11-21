import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import { buildEntityRecord, buildJobListRecord } from "@/testing/records";
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

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { CaseOverviewTab } from "@/domains/dashboard/components/case-overview-tab";
import { procedureDouble } from "@/testing/orpc-client";

const evidencePickerPage = procedureDouble("evidence.pickerPage");
const getEvidenceMany = procedureDouble("evidence.getMany");
const listJobs = procedureDouble("jobs.listForCase");

const getEntities = procedureDouble("entities.getMany");
const proposalQueuePage = procedureDouble("proposals.queuePage");
const caseCounts = procedureDouble("cases.counts");

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
    caseCounts.mockResolvedValue(COUNTS);
    evidencePickerPage.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: exact(0),
    });
    getEvidenceMany.mockResolvedValue([]);
    getEntities.mockResolvedValue([]);
    listJobs.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: exact(0),
    });
    proposalQueuePage.mockResolvedValue({
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
    expect(caseCounts).toHaveBeenCalledTimes(1);
    expect(caseCounts).toHaveBeenCalledWith({
      caseId: CASE.id,
      dayStart: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it("reads one page of each recent list and never a whole list", async () => {
    renderTab();
    await screen.findByText("Nothing yet");

    expect(evidencePickerPage).toHaveBeenCalledWith({
      caseId: CASE.id,
      limit: 12,
    });
    expect(proposalQueuePage).toHaveBeenCalledTimes(1);
    expect(listJobs).toHaveBeenCalledTimes(1);
    expect(listJobs).toHaveBeenCalledWith({ caseId: CASE.id, limit: 50 });
    for (const whole of [
      procedureDouble("evidence.list"),
      procedureDouble("edges.list"),
      procedureDouble("identifiers.list"),
    ]) {
      expect(whole).not.toHaveBeenCalled();
    }
  });

  it("names the Entity a Job's input points at by reading it by id", async () => {
    const entityId = testId(30);
    listJobs.mockResolvedValue({
      items: [
        buildJobListRecord({
          id: testId(31),
          capabilityId: "network.dns.lookup",
          input: { entityId },
          resultSummary: null,
        }),
      ],
      nextCursor: null,
      total: exact(1),
    });
    getEntities.mockResolvedValue([
      buildEntityRecord({
        id: entityId,
        name: "Acme Ltd",
        kind: "org",
        slug: "acme-ltd",
      }),
    ]);
    renderTab();

    await waitFor(() => {
      expect(getEntities).toHaveBeenCalledWith({
        caseId: CASE.id,
        ids: [entityId],
      });
    });
  });

  it("shows a blank activity slate when there is no recent activity", async () => {
    renderTab();
    expect(await screen.findByText("Nothing yet")).toBeInTheDocument();
    expect(screen.getByText("Case settings form")).toBeInTheDocument();
  });

  it("shows a retryable error when the counts fail to load", async () => {
    caseCounts.mockRejectedValue(new Error("overview stats failed"));
    renderTab();

    expect(
      await screen.findByText("overview stats failed")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TaskRecord } from "@/domains/tasks/types";
import { buildProposalQueueItem } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    search,
  }: {
    to: string;
    params?: { caseSlug: string };
    children: React.ReactNode;
    search?: Record<string, string>;
  }) => {
    const path = to.replace("$caseSlug", params?.caseSlug ?? "");
    return (
      <a
        href={
          search ? `${path}?${new URLSearchParams(search).toString()}` : path
        }
      >
        {children}
      </a>
    );
  },
}));

import { DashboardDueTasksSection } from "@/domains/dashboard/components/dashboard-due-tasks-section";
import { DashboardTriageSection } from "@/domains/dashboard/components/dashboard-triage-section";

const PROPOSAL = buildProposalQueueItem({
  id: "prop-1",
  capabilityId: null,
  summary: "Link entity A to B",
  createdAt: "2026-01-02T00:00:00.000Z",
});

const TASK: TaskRecord = {
  id: "task-1",
  caseId: testCaseId(1),
  entityId: null,
  title: "Review intake",
  description: null,
  status: "in_progress",
  priority: null,
  dueDate: "2026-01-10",
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("DashboardTriageSection", () => {
  it("prompts for an active case when none is selected", () => {
    render(<DashboardTriageSection caseSlug={null} proposals={[]} />);
    expect(
      screen.getByText(/Select a Case in the sidebar to see pending proposals/)
    ).toBeInTheDocument();
  });

  it("lists recent proposals when a case is active", () => {
    render(<DashboardTriageSection caseSlug="alpha" proposals={[PROPOSAL]} />);
    expect(screen.getByText("Link entity A to B")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Link entity A to B/ })
    ).toHaveAttribute(
      "href",
      "/cases/alpha/triage?status=pending&proposalId=prop-1"
    );
  });

  it("uses proposal title when summary is empty", () => {
    const proposal = {
      ...PROPOSAL,
      id: "prop-2",
      summary: null,
      capabilityId: "network.shodan.lookup",
    };
    render(<DashboardTriageSection caseSlug="alpha" proposals={[proposal]} />);
    expect(screen.getByText("Shodan Lookup")).toBeInTheDocument();
  });

  it("uses proposal title when summary is blank", () => {
    const proposal = {
      ...PROPOSAL,
      id: "prop-3",
      summary: "",
      capabilityId: "network.shodan.lookup",
    };
    render(<DashboardTriageSection caseSlug="alpha" proposals={[proposal]} />);
    expect(screen.getByText("Shodan Lookup")).toBeInTheDocument();
  });
});

describe("DashboardDueTasksSection", () => {
  it("explains due tasks require an active case", () => {
    render(<DashboardDueTasksSection caseSlug={null} tasks={[]} />);
    expect(
      screen.getByText(
        /Overdue and near-due tasks show up once a Case is active/
      )
    ).toBeInTheDocument();
  });

  it("lists due tasks for the active case", () => {
    render(<DashboardDueTasksSection caseSlug="alpha" tasks={[TASK]} />);
    expect(screen.getByText("Review intake")).toBeInTheDocument();
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("says how many more are due than it lists, capped as the server counted", () => {
    const { rerender } = render(
      <DashboardDueTasksSection
        caseSlug="alpha"
        tasks={[TASK]}
        total={{ count: 13, isCapped: false }}
      />
    );
    expect(screen.getByText(/and 12 more/)).toBeInTheDocument();
    rerender(
      <DashboardDueTasksSection
        caseSlug="alpha"
        tasks={[TASK]}
        total={{ count: 1000, isCapped: true }}
      />
    );
    expect(screen.getByText(/and 999\+ more/)).toBeInTheDocument();
  });
});

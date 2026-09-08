import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TaskRecord } from "@/domains/tasks/types";
import type { ProposalRecord } from "@/domains/triage/triage.functions";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    search,
  }: {
    to: string;
    children: React.ReactNode;
    search?: Record<string, string>;
  }) => (
    <a href={search ? `${to}?${new URLSearchParams(search).toString()}` : to}>
      {children}
    </a>
  ),
}));

import {
  DashboardDueTasksSection,
  DashboardTriageSection,
} from "@/domains/dashboard/components/dashboard-panels";

const PROPOSAL = {
  id: "prop-1",
  caseId: "case-1",
  jobId: null,
  capabilityId: null,
  playbookId: null,
  status: "pending",
  patch: [],
  summary: "Link entity A to B",
  suppressedCount: 0,
  evidenceIds: [],
  rejectReason: null,
  decidedBy: null,
  decidedAt: null,
  createdAt: "2026-01-02T00:00:00.000Z",
  agentSourced: false,
  userOverridden: false,
  createdBy: null,
  createdByLabel: null,
  decidedByLabel: null,
} satisfies ProposalRecord;

const TASK: TaskRecord = {
  id: "task-1",
  caseId: "case-1",
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
    render(<DashboardTriageSection hasCase={false} proposals={[]} />);
    expect(
      screen.getByText(/Select a Case in the sidebar to see pending proposals/)
    ).toBeInTheDocument();
  });

  it("lists recent proposals when a case is active", () => {
    render(<DashboardTriageSection hasCase proposals={[PROPOSAL]} />);
    expect(screen.getByText("Link entity A to B")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Link entity A to B/ })
    ).toHaveAttribute("href", "/triage?proposalId=prop-1");
  });

  it("uses proposal title when summary is empty", () => {
    const proposal = {
      ...PROPOSAL,
      id: "prop-2",
      summary: null,
      capabilityId: "network.shodan.lookup",
      patch: [],
    } as ProposalRecord;
    render(<DashboardTriageSection hasCase proposals={[proposal]} />);
    expect(screen.getByText("Shodan Lookup")).toBeInTheDocument();
  });

  it("uses proposal title when summary is blank", () => {
    const proposal = {
      ...PROPOSAL,
      id: "prop-3",
      summary: "",
      capabilityId: "network.shodan.lookup",
      patch: [],
    } as ProposalRecord;
    render(<DashboardTriageSection hasCase proposals={[proposal]} />);
    expect(screen.getByText("Shodan Lookup")).toBeInTheDocument();
  });
});

describe("DashboardDueTasksSection", () => {
  it("explains due tasks require an active case", () => {
    render(<DashboardDueTasksSection hasCase={false} tasks={[]} />);
    expect(
      screen.getByText(
        /Overdue and near-due tasks show up once a Case is active/
      )
    ).toBeInTheDocument();
  });

  it("lists due tasks for the active case", () => {
    render(<DashboardDueTasksSection hasCase tasks={[TASK]} />);
    expect(screen.getByText("Review intake")).toBeInTheDocument();
  });
});

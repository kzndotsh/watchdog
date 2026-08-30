import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { JobDetail } from "@/domains/jobs/components/job-detail";
import type { JobRecord } from "@/domains/jobs/jobs.functions";
import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/domains/jobs/components/artifact-content", () => ({
  ArtifactContent: ({ name }: { name: string }) => <div>{name}</div>,
}));

function jobRecord(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: testId(11),
    caseId: testId(10),
    capabilityId: "network.dns.lookup",
    status: "queued",
    input: { host: "mailhost.test" },
    output: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    error: null,
    interpretError: null,
    proposalId: null,
    resultSummary: null,
    fromCache: false,
    suppressedCount: 0,
    playbookRunId: null,
    playbookId: null,
    playbookRunStatus: null,
    playbookStep: null,
    playbookFanIndex: 0,
    evidenceIds: [],
    actorId: "test-actor",
    logs: ["collect started\nresolved A record"],
    ...overrides,
  };
}

describe("JobDetail", () => {
  it("shows empty detail copy when nothing is selected", () => {
    render(<JobDetail job={null} busy={false} onCancel={vi.fn()} />);

    expect(screen.getByText("Select a job")).toBeInTheDocument();
  });

  it("renders queued job header, logs, and cancel action", () => {
    render(<JobDetail job={jobRecord()} busy={false} onCancel={vi.fn()} />);

    expect(screen.getByText("mailhost.test")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Log" })).toBeInTheDocument();
    expect(screen.getByText(/resolved A record/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows input JSON on the input tab", async () => {
    const user = userEvent.setup();

    render(<JobDetail job={jobRecord()} busy={false} onCancel={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Input" }));

    expect(screen.getByText("mailhost.test")).toBeInTheDocument();
  });

  it("links to inbox when a proposal was created", () => {
    const proposalId = testId(50);

    render(
      <JobDetail
        job={jobRecord({
          status: "succeeded",
          proposalId,
          output: [
            {
              name: "report.json",
              sha256: "abc",
              mime: "application/json",
              uri: "s3://bucket/report.json",
            },
          ],
        })}
        busy={false}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("Open Proposal in Triage")).toBeInTheDocument();
  });
});

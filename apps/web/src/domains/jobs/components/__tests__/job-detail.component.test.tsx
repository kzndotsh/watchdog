import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { JobDetail } from "@/domains/jobs/components/job-detail";
import type { JobListRecord, JobRecord } from "@watchdog/core/jobs";
import { testCaseId } from "@watchdog/schemas/testing";
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
    caseId: testCaseId(10),
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
    retryOfJobId: null,
    evidenceIds: [],
    actorId: "test-actor",
    actorLabel: "test-actor",
    logs: ["collect started\nresolved A record"],
    ...overrides,
  };
}

describe("JobDetail", () => {
  it("shows empty detail copy when nothing is selected", () => {
    render(<JobDetail job={null} isBusy={false} onCancel={vi.fn()} />);

    expect(screen.getByText("Select a job")).toBeInTheDocument();
  });

  it("renders queued job header, logs, and cancel action", () => {
    render(<JobDetail job={jobRecord()} isBusy={false} onCancel={vi.fn()} />);

    expect(screen.getByText("mailhost.test")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Log" })).toBeInTheDocument();
    expect(screen.getByText(/resolved A record/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows the resolved actor label instead of the raw actor id", () => {
    render(
      <JobDetail
        job={jobRecord({
          actorId: "user-uuid",
          actorLabel: "ada",
        })}
        isBusy={false}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("ada")).toBeInTheDocument();
    expect(screen.getByText("By")).toBeInTheDocument();
    expect(screen.queryByText("user-uuid")).not.toBeInTheDocument();
  });

  it("shows input JSON on the input tab", async () => {
    const user = userEvent.setup();

    render(<JobDetail job={jobRecord()} isBusy={false} onCancel={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Input" }));

    expect(screen.getByText("mailhost.test")).toBeInTheDocument();
  });

  it("shows playbook title and step capability for playbook jobs", () => {
    render(
      <JobDetail
        job={jobRecord({
          playbookId: "host-footprint",
          playbookRunId: testId(12),
          playbookStep: 0,
          capabilityId: "network.dns.lookup",
        })}
        isBusy={false}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("Host Footprint")).toBeInTheDocument();
    expect(screen.getByText(/Step 1 ·/)).toBeInTheDocument();
  });

  it("does not show an empty log state under a playbook spine", () => {
    const step = jobRecord({
      status: "succeeded",
      logs: [],
      playbookId: "host-footprint",
      playbookRunId: testId(12),
      playbookStep: 0,
      capabilityId: "network.dns.lookup",
    });

    render(
      <JobDetail
        job={step}
        runSiblings={[step]}
        isBusy={false}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getAllByText(/DNS Lookup/).length).toBeGreaterThan(1);
    expect(screen.queryByText("No logs yet")).not.toBeInTheDocument();
  });

  it("shows playbook blocked hint for step 0 without blaming a prior step", () => {
    render(
      <JobDetail
        job={jobRecord({
          status: "blocked",
          playbookId: "host-footprint",
          playbookRunId: testId(12),
          playbookStep: 0,
          capabilityId: "network.shodan.lookup",
          error: null,
        })}
        runSiblings={[
          {
            ...jobRecord({
              status: "blocked",
              playbookId: "host-footprint",
              playbookRunId: testId(12),
              playbookStep: 0,
              capabilityId: "network.shodan.lookup",
            }),
          },
        ]}
        isBusy={false}
        onCancel={vi.fn()}
      />
    );

    expect(
      screen.getByText("Blocked — waiting on credentials or setup.")
    ).toBeInTheDocument();
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
        isBusy={false}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("Open Proposal in Triage")).toBeInTheDocument();
  });
});

describe("JobDetail retry and attempts", () => {
  const chain = (...statuses: JobRecord["status"][]): JobListRecord[] =>
    statuses.map((status, i) => {
      const { logs: _logs, ...row } = jobRecord({
        id: testId(21 + i),
        status,
        createdAt: `2026-01-01T00:0${i}:00.000Z`,
      });
      return row;
    });

  it.each(["failed", "cancelled", "succeeded"] as const)(
    "offers Retry and Edit and re-run on a %s job",
    async (status) => {
      const user = userEvent.setup();
      const onRetry = vi.fn();
      const onEditAndRerun = vi.fn();

      render(
        <JobDetail
          job={jobRecord({ status })}
          isBusy={false}
          onCancel={vi.fn()}
          onRetry={onRetry}
          onEditAndRerun={onEditAndRerun}
        />
      );

      await user.click(screen.getByRole("button", { name: "Retry" }));
      await user.click(screen.getByRole("button", { name: "Edit and re-run" }));

      expect(onRetry).toHaveBeenCalledOnce();
      expect(onEditAndRerun).toHaveBeenCalledOnce();
      expect(
        screen.queryByRole("button", { name: "Cancel" })
      ).not.toBeInTheDocument();
    }
  );

  it.each(["queued", "running"] as const)(
    "offers neither on a %s job",
    (status) => {
      render(
        <JobDetail
          job={jobRecord({ status })}
          isBusy={false}
          onCancel={vi.fn()}
          onRetry={vi.fn()}
          onEditAndRerun={vi.fn()}
        />
      );

      expect(
        screen.queryByRole("button", { name: "Retry" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Edit and re-run" })
      ).not.toBeInTheDocument();
    }
  );

  it("lists earlier and later attempts and selects another one", async () => {
    const user = userEvent.setup();
    const onSelectAttempt = vi.fn();
    const attempts = chain("failed", "failed", "succeeded");

    render(
      <JobDetail
        job={jobRecord({ id: testId(22), status: "failed" })}
        attempts={attempts}
        onSelectAttempt={onSelectAttempt}
        isBusy={false}
        onCancel={vi.fn()}
      />
    );

    const list = screen.getByRole("region", { name: "Attempts" });
    expect(within(list).getByText(/this attempt/)).toBeInTheDocument();
    expect(within(list).getByText("Attempt 2")).toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: "Attempt 1" }));
    await user.click(within(list).getByRole("button", { name: "Attempt 3" }));

    expect(onSelectAttempt).toHaveBeenNthCalledWith(1, testId(21));
    expect(onSelectAttempt).toHaveBeenNthCalledWith(2, testId(23));
  });

  it("shows no attempts section for a Job that was never retried", () => {
    render(
      <JobDetail
        job={jobRecord({ status: "failed" })}
        attempts={chain("failed")}
        isBusy={false}
        onCancel={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("region", { name: "Attempts" })
    ).not.toBeInTheDocument();
  });
});

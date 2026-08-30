import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProcessRunCard } from "@/domains/intake/components/process-run-card";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/domains/jobs/components/artifact-content", () => ({
  ArtifactContent: ({ name }: { name: string }) => <div>{name}</div>,
}));

function job(overrides: Partial<JobListRecord> = {}): JobListRecord {
  return {
    id: testId(11),
    caseId: testId(10),
    capabilityId: "network.dns.lookup",
    status: "succeeded",
    input: { host: "mailhost.test" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    startedAt: null,
    finishedAt: "2026-01-01T00:01:00.000Z",
    error: null,
    interpretError: null,
    proposalId: null,
    resultSummary: "Resolved A record",
    fromCache: false,
    suppressedCount: 0,
    playbookRunId: null,
    playbookId: null,
    playbookRunStatus: null,
    playbookStep: null,
    evidenceIds: [],
    output: [
      {
        name: "report.json",
        sha256: "abc",
        mime: "application/json",
        uri: "s3://bucket/report.json",
      },
    ],
    actorId: "test-actor",
    playbookFanIndex: 0,
    ...overrides,
  };
}

describe("ProcessRunCard", () => {
  it("renders cap identity and artifact output", () => {
    render(<ProcessRunCard job={job()} defaultOpen />);

    expect(screen.getByText("Resolved A record")).toBeInTheDocument();
    expect(screen.getByText("1 artifact")).toBeInTheDocument();
    expect(screen.getByText("report.json")).toBeInTheDocument();
  });

  it("shows live chip for running jobs", () => {
    render(
      <ProcessRunCard
        job={job({ status: "running", output: [] })}
        defaultOpen
      />
    );

    expect(screen.getByText("live")).toBeInTheDocument();
    expect(
      screen.getByText("Still running — output appears when the job finishes.")
    ).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
    ...props
  }: {
    children: React.ReactNode;
    to?: string;
    search?: { id?: string };
  }) => (
    <a href={to} data-search-id={search?.id} {...props}>
      {children}
    </a>
  ),
}));

import { TriageDecideHeader } from "@/domains/triage/components/triage-decide-header";
import type { ProposalRecord } from "@watchdog/core";

function pendingProposal(
  overrides: Partial<ProposalRecord> = {}
): ProposalRecord {
  return {
    id: testId(50),
    caseId: testId(10),
    jobId: null,
    capabilityId: "network.dns.lookup",
    status: "pending",
    patch: [
      {
        op: "create",
        resource: "claim",
        id: testId(30),
        data: {
          entityId: testId(20),
          text: "Ada observed a host",
          class: "observation",
        },
        evidenceIds: [],
      },
    ],
    summary: "dns lookup",
    suppressedCount: 0,
    evidenceIds: [],
    rejectReason: null,
    decidedBy: null,
    decidedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    agentSourced: false,
    userOverridden: false,
    createdBy: null,
    identifierCollisions: [],
    entityNames: { [testId(20)]: "Alpha" },
    ...overrides,
  };
}

describe("TriageDecideHeader", () => {
  it("renders context strip for pending proposals", () => {
    render(<TriageDecideHeader proposal={pendingProposal()} linkedIds={[]} />);

    expect(screen.getByText("Entity")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("DNS Lookup")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("links the entity name to the dossier when slug is known", () => {
    render(
      <TriageDecideHeader
        proposal={pendingProposal({
          entitySlugs: { [testId(20)]: "alpha" },
        })}
        linkedIds={[]}
      />
    );

    const link = screen.getByRole("link", { name: "Alpha" });
    expect(link).toHaveAttribute("href", "/entities/$entitySlug");
  });

  it("links the producing cap to Collect when jobId is set", () => {
    const jobId = testId(99);
    render(
      <TriageDecideHeader
        proposal={pendingProposal({ jobId })}
        linkedIds={[]}
      />
    );

    const link = screen.getByText("DNS Lookup");
    expect(link).toHaveAttribute("data-search-id", jobId);
    expect(link.closest("a")).toHaveAttribute("href", "/collect");
  });

  it("shows reject reason for decided proposals", () => {
    render(
      <TriageDecideHeader
        proposal={pendingProposal({
          status: "rejected",
          rejectReason: "Duplicate finding",
          decidedAt: "2026-01-02T00:00:00.000Z",
        })}
        linkedIds={[]}
      />
    );

    expect(screen.getByText("Duplicate finding")).toBeInTheDocument();
    expect(screen.getByText(/Decided/)).toBeInTheDocument();
  });
});

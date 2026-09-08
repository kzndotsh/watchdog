import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { CollectDetail } from "@/domains/collect/components/collect-detail";
import type { CollectRow } from "@/domains/collect/types";
import type { IntakeEvidenceActions } from "@/domains/intake/hooks/use-intake-actions";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord, JobRecord } from "@/domains/jobs/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/domains/jobs/components/artifact-content", () => ({
  ArtifactContent: ({ name }: { name: string }) => <div>{name}</div>,
}));

vi.mock("@/domains/intake/components/evidence-detail", () => ({
  EvidenceDetail: ({ evidence }: { evidence: EvidenceRecord }) => (
    <div data-testid="evidence-detail">{evidence.id}</div>
  ),
}));

function listJob(overrides: Partial<JobListRecord> = {}): JobListRecord {
  return {
    id: testId(12),
    caseId: testId(10),
    capabilityId: "network.dns.lookup",
    status: "running",
    input: { host: "step1.test" },
    createdAt: "2026-01-01T00:02:00.000Z",
    updatedAt: "2026-01-01T00:02:00.000Z",
    startedAt: null,
    finishedAt: null,
    error: null,
    interpretError: null,
    proposalId: null,
    resultSummary: null,
    fromCache: false,
    suppressedCount: 0,
    playbookRunId: testId(14),
    playbookId: testId(15),
    playbookRunStatus: "running",
    playbookStep: 1,
    evidenceIds: [],
    output: [],
    actorId: "test-actor",
    actorLabel: "test-actor",
    playbookFanIndex: 0,
    ...overrides,
  };
}

function jobRecord(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    ...listJob(),
    logs: ["collect started"],
    output: null,
    ...overrides,
  };
}

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: testId(40),
    caseId: testId(10),
    entityId: null,
    kind: "attestation",
    label: "note",
    notes: null,
    mime: "text/plain",
    uri: null,
    sha256: null,
    text: "dump body",
    sourceUrl: null,
    actorId: "test-actor",
    actorLabel: "test-actor",
    capturedAt: "2026-01-01T00:00:00.000Z",
    processedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

const step1 = listJob({ id: testId(12) });

const playbookRow: CollectRow = {
  id: testId(14),
  title: "Playbook run",
  hint: null,
  state: "running",
  when: "2026-01-01T00:02:00.000Z",
  entityId: null,
  evidence: null,
  runs: [{ job: step1, role: "step" }],
  playbookRunId: testId(14),
  recipe: { step: 1, total: 2 },
};

function evidenceRow(rowEvidence: EvidenceRecord): CollectRow {
  return {
    id: rowEvidence.id,
    title: rowEvidence.label ?? rowEvidence.kind,
    hint: null,
    state: "landed",
    when: rowEvidence.capturedAt,
    entityId: rowEvidence.entityId,
    evidence: rowEvidence,
    runs: [],
    playbookRunId: null,
    recipe: null,
  };
}

function actions(): IntakeEvidenceActions {
  return {
    busy: false,
    processing: false,
    aiProcessing: false,
    enriching: false,
    attaching: false,
    onProcess: vi.fn(),
    onAiProcess: vi.fn(),
    onEnrich: vi.fn(),
    onHide: vi.fn(),
    onRestore: vi.fn(),
    onAttachEntity: vi.fn(),
  };
}

function renderDetail(
  overrides: Partial<ComponentProps<typeof CollectDetail>> = {}
) {
  return render(
    <CollectDetail
      row={playbookRow}
      job={null}
      caseId={testId(10)}
      jobs={[step1]}
      entities={[]}
      entityNameById={new Map()}
      allowThirdPartyEgress={false}
      evidenceActions={actions()}
      evidenceTitleById={new Map()}
      entityTitleById={new Map()}
      runSiblings={[step1]}
      recipeTotal={2}
      busy={false}
      onCancel={vi.fn()}
      {...overrides}
    />
  );
}

describe("CollectDetail", () => {
  it("shows the queue empty gate when no row is selected", () => {
    renderDetail({ row: null, job: null });

    expect(screen.getByText("Select an item")).toBeInTheDocument();
    expect(screen.queryByText("Select a job")).not.toBeInTheDocument();
  });

  it("shows JobDetail for the passed job after the empty gate", () => {
    const { rerender } = renderDetail({ row: playbookRow, job: null });

    expect(screen.getByText("Select a job")).toBeInTheDocument();
    expect(screen.queryByText("Select an item")).not.toBeInTheDocument();
    expect(screen.queryByText("step1.test")).not.toBeInTheDocument();

    rerender(
      <CollectDetail
        row={playbookRow}
        job={jobRecord({ id: testId(12), input: { host: "step1.test" } })}
        caseId={testId(10)}
        jobs={[step1]}
        entities={[]}
        entityNameById={new Map()}
        allowThirdPartyEgress={false}
        evidenceActions={actions()}
        evidenceTitleById={new Map()}
        entityTitleById={new Map()}
        runSiblings={[step1]}
        recipeTotal={2}
        busy={false}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("step1.test")).toBeInTheDocument();
    expect(screen.queryByText("Select a job")).not.toBeInTheDocument();
  });

  it("remounts EvidenceDetail with the evidence id", () => {
    const dump = evidence({ id: testId(40) });
    renderDetail({ row: evidenceRow(dump), job: null });

    expect(screen.getByTestId("evidence-detail")).toHaveTextContent(testId(40));
    expect(screen.queryByText("Select a job")).not.toBeInTheDocument();
  });
});

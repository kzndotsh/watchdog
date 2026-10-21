import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { CollectDetail } from "@/domains/collect/components/collect-detail";
import type { CollectRow } from "@/domains/collect/types";
import type { IntakeEvidenceActions } from "@/domains/intake/hooks/use-intake-actions";
import { buildJobListRecord, buildJobRecord } from "@/testing/records";
import { render, screen, within } from "@/testing/render-in-case";
import type { PlaybookRunView } from "@watchdog/schemas/jobs";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

const RUN_ID = testId(60);
const FAILED_JOB_ID = testId(61);
const OK_JOB_ID = testId(62);

const runFields = {
  caseId: testCaseId(10),
  playbookRunId: RUN_ID,
  playbookId: "domain-triage",
  playbookRunStatus: "finished",
  playbookRunOutcome: "partial",
} as const;

const failedStep = buildJobListRecord({
  ...runFields,
  id: FAILED_JOB_ID,
  capabilityId: "network.dns.lookup",
  status: "failed",
  playbookStep: 0,
});
const okStep = buildJobListRecord({
  ...runFields,
  id: OK_JOB_ID,
  capabilityId: "network.whois.lookup",
  status: "succeeded",
  playbookStep: 1,
});

/** Step 0 failed, step 1 (independent) succeeded, step 2 reads step 0 and was skipped. */
const partialRun: PlaybookRunView = {
  id: RUN_ID,
  caseId: testCaseId(10),
  playbookId: "domain-triage",
  status: "finished",
  outcome: "partial",
  createdAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:03:00.000Z",
  steps: [
    {
      step: 0,
      capabilityId: "network.dns.lookup",
      state: "failed",
      jobIds: [FAILED_JOB_ID],
    },
    {
      step: 1,
      capabilityId: "network.whois.lookup",
      state: "succeeded",
      jobIds: [OK_JOB_ID],
    },
    {
      step: 2,
      capabilityId: "network.ct.lookup",
      state: "skipped",
      blockedBy: 0,
      jobIds: [],
    },
  ],
};

const row: CollectRow = {
  id: RUN_ID,
  title: "Domain triage",
  hint: null,
  state: "failed",
  when: "2026-01-01T00:03:00.000Z",
  entityId: null,
  evidence: null,
  runs: [
    { job: okStep, role: "step" },
    { job: failedStep, role: "step" },
  ],
  playbookRunId: RUN_ID,
  recipe: { step: 3, total: 3, outcome: "partial" },
};

function actions(): IntakeEvidenceActions {
  return {
    isBusy: false,
    isProcessing: false,
    isAiProcessing: false,
    isEnriching: false,
    isAttaching: false,
    onProcess: vi.fn(),
    onAiProcess: vi.fn(),
    onEnrich: vi.fn(),
    onHide: vi.fn(),
    onRestore: vi.fn(),
    onAttachEntity: vi.fn(),
  };
}

function playbookSpine(): HTMLElement {
  const spine = screen.getByText(/^Playbook ·/).closest("div");
  if (spine === null) throw new TypeError("playbook spine missing");
  return spine;
}

function renderDetail(
  overrides: Partial<ComponentProps<typeof CollectDetail>> = {}
) {
  return render(
    <CollectDetail
      row={row}
      job={buildJobRecord({ ...failedStep, logs: ["dns lookup failed"] })}
      caseId={testId(10)}
      jobs={[failedStep, okStep]}
      entities={[]}
      entityNameById={new Map()}
      allowThirdPartyEgress={false}
      evidenceActions={actions()}
      evidenceTitleById={new Map()}
      entityTitleById={new Map()}
      runSiblings={[failedStep, okStep]}
      recipeTotal={3}
      playbookRun={partialRun}
      isBusy={false}
      onCancel={vi.fn()}
      {...overrides}
    />
  );
}

describe("CollectDetail for a partial Playbook run", () => {
  it("shows the run's outcome and each step's outcome, skipped steps with their reason", () => {
    renderDetail();

    const spine = playbookSpine();
    expect(within(spine).getByText("Partial")).toBeInTheDocument();
    expect(
      within(spine).getByText("· 1 failed · 1 skipped")
    ).toBeInTheDocument();

    const steps = within(spine).getAllByText(/^\d ·/);
    expect(steps.map((el) => el.textContent?.replaceAll(/\s+/g, " "))).toEqual([
      "1 · DNS Lookup Failed",
      "2 · WHOIS Lookup Succeeded",
      "3 · Ct Lookup Skipped",
    ]);
    expect(
      within(spine).getByText("Step 1 (DNS Lookup) did not succeed")
    ).toBeInTheDocument();
  });

  it("names the run's outcome in the header strip, where it survives the output tab", () => {
    renderDetail();

    const header = screen.getByRole("tablist").closest("header");
    expect(header).toHaveTextContent(/Run\s*Partial/);
  });

  it("selects the Job of another step from the spine", async () => {
    const onSelectStep = vi.fn();
    renderDetail({
      job: buildJobRecord({ ...failedStep, logs: [] }),
      onSelectStep,
    });

    await userEvent.click(screen.getByRole("button", { name: "WHOIS Lookup" }));

    expect(onSelectStep).toHaveBeenCalledWith(OK_JOB_ID);
  });

  it("falls back to the run's Jobs while the run's view has not loaded", () => {
    renderDetail({ playbookRun: null });

    expect(screen.queryByText("Skipped")).not.toBeInTheDocument();
    expect(within(playbookSpine()).getByText(/1 · DNS Lookup/)).toBeVisible();
    expect(within(playbookSpine()).getByText(/2 · WHOIS Lookup/)).toBeVisible();
  });

  it("reads a pending step of a cancelled run as not run", () => {
    renderDetail({
      playbookRun: {
        ...partialRun,
        status: "cancelled",
        outcome: null,
        steps: [
          {
            step: 0,
            capabilityId: "network.dns.lookup",
            state: "failed",
            jobIds: [FAILED_JOB_ID],
          },
          {
            step: 1,
            capabilityId: "network.whois.lookup",
            state: "pending",
            jobIds: [],
          },
        ],
      },
    });

    expect(screen.getByText("Not run")).toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });
});

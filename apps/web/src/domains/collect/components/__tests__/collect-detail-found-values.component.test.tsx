import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fns = vi.hoisted(() => ({
  createIdentifierFn: vi.fn(),
  updateIdentifierFn: vi.fn(),
}));
const listJobFoundValuesFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => fns);
vi.mock("@/domains/jobs/jobs.functions", () => ({
  listJobFoundValuesFn,
  listJobProviderCallsFn: vi.fn(),
  getJobFn: vi.fn(),
  getPlaybookRunFn: vi.fn(),
  listCapabilitiesFn: vi.fn(),
  listJobsFn: vi.fn(),
  listPlaybooksFn: vi.fn(),
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

import { CollectDetail } from "@/domains/collect/components/collect-detail";
import type { CollectRow } from "@/domains/collect/types";
import type { IntakeEvidenceActions } from "@/domains/intake/hooks/use-intake-actions";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { entityMatchesQuery } from "@/shared/ui/entity-match";
import { memoryPickerPort } from "@/testing/memory-picker-port";
import { buildJobListRecord, buildJobRecord } from "@/testing/records";
import { RouteCaseProvider } from "@/testing/route-case";
import type { JobFoundValues } from "@watchdog/schemas/jobs";
import { testId } from "@watchdog/test-kit";

const EVIDENCE_ID = testId(41);
const ACME: EntityOption = {
  id: testId(2),
  name: "Acme",
  kind: "org",
  slug: "acme",
};

const FOUND: JobFoundValues = {
  hasReader: true,
  values: [
    {
      type: "ip",
      platform: "",
      value: "192.0.2.1",
      sources: ["A record"],
      onEntities: [],
    },
  ],
  total: 1,
  isTruncated: false,
};

const actions: IntakeEvidenceActions = {
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

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <RouteCaseProvider>{children}</RouteCaseProvider>
    </QueryClientProvider>
  );
}

async function openAddDialog() {
  const job = buildJobRecord({
    status: "running",
    evidenceIds: [EVIDENCE_ID],
  });
  const row: CollectRow = {
    id: job.id,
    title: "DNS lookup",
    hint: null,
    state: "running",
    when: job.createdAt,
    entityId: null,
    evidence: null,
    runs: [{ job: buildJobListRecord({ id: job.id }), role: "step" }],
    playbookRunId: null,
    recipe: null,
  };
  const user = userEvent.setup();
  render(
    <CollectDetail
      row={row}
      job={job}
      caseId={job.caseId}
      jobs={[]}
      entityPort={
        memoryPickerPort<EntityOption>([ACME], {
          matches: (entity, q) => entityMatchesQuery(entity, q),
        }).port
      }
      allowedEgress={["local", "target"]}
      evidenceActions={actions}
      evidenceTitleById={new Map()}
      entityTitleById={new Map()}
      runSiblings={[]}
      isBusy={false}
      onCancel={vi.fn()}
    />,
    { wrapper: Providers }
  );
  await user.click(screen.getByRole("tab", { name: "Found" }));
  await user.click(
    await screen.findByRole("button", { name: "Add 192.0.2.1 to an Entity" })
  );
  expect(screen.getByRole("dialog", { name: "Add to Entity" })).toBeVisible();
  await user.click(screen.getByRole("combobox", { name: "Entity" }));
  await user.click(await screen.findByRole("option", { name: "Acme" }));
  return { user, job };
}

describe("CollectDetail Add to Entity", () => {
  beforeEach(() => {
    fns.createIdentifierFn.mockReset();
    listJobFoundValuesFn.mockReset();
    listJobFoundValuesFn.mockResolvedValue(FOUND);
  });

  it("adds a found value to the picked Entity at Unverified, citing the Job's Evidence", async () => {
    fns.createIdentifierFn.mockResolvedValue({ id: testId(9) });
    const { user, job } = await openAddDialog();

    await user.click(screen.getByRole("button", { name: /^Add$/ }));

    expect(fns.createIdentifierFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: job.caseId,
        entityId: ACME.id,
        type: "ip",
        value: "192.0.2.1",
        confidence: "unverified",
        evidenceIds: [EVIDENCE_ID],
      }),
    });
    expect(
      screen.queryByRole("dialog", { name: "Add to Entity" })
    ).not.toBeInTheDocument();
  });

  it("keeps the dialog open with the error when the write fails", async () => {
    fns.createIdentifierFn.mockRejectedValue(new Error("boom"));
    const { user } = await openAddDialog();

    await user.click(screen.getByRole("button", { name: /^Add$/ }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Add to Entity" })).toBeVisible();
  });
});

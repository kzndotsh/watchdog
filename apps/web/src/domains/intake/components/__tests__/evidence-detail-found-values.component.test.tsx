import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { EvidenceDetail } from "@/domains/intake/components/evidence-detail";
import type { IntakeEvidenceActions } from "@/domains/intake/hooks/use-intake-actions";
import { emptyEntityPickerPort } from "@/testing/memory-picker-port";
import { buildEvidenceRecord, buildJobListRecord } from "@/testing/records";
import { RouteCaseProvider } from "@/testing/route-case";
import type { JobFoundValues } from "@watchdog/schemas/jobs";
import { testId } from "@watchdog/test-kit";

const listJobFoundValuesFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/jobs/jobs.functions", () => ({
  listJobFoundValuesFn,
  listJobProviderCallsFn: vi.fn(),
  getJobFn: vi.fn(),
  getPlaybookRunFn: vi.fn(),
  listCapabilitiesFn: vi.fn(),
  listJobsFn: vi.fn(),
  listPlaybooksFn: vi.fn(),
}));

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <RouteCaseProvider>{children}</RouteCaseProvider>
    </QueryClientProvider>
  );
}

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

describe("EvidenceDetail Found tab", () => {
  it("lists the producing Job's found values and hands one to Add to Entity with that Job", async () => {
    const user = userEvent.setup();
    listJobFoundValuesFn.mockResolvedValue(FOUND);
    const evidence = buildEvidenceRecord();
    const producing = buildJobListRecord({
      id: testId(40),
      caseId: evidence.caseId,
      capabilityId: "network.dns.lookup",
      status: "succeeded",
      evidenceIds: [evidence.id],
    });
    const onAdd = vi.fn();
    render(
      <EvidenceDetail
        entityPort={emptyEntityPickerPort()}
        evidence={evidence}
        caseId={evidence.caseId}
        jobs={[producing]}
        actions={actions}
        onAddFoundValue={onAdd}
      />,
      { wrapper: Providers }
    );

    await user.click(screen.getByRole("tab", { name: "Found" }));
    await user.click(
      await screen.findByRole("button", { name: "Add 192.0.2.1 to an Entity" })
    );

    expect(listJobFoundValuesFn).toHaveBeenCalledWith({
      data: { caseId: evidence.caseId, jobId: producing.id },
    });
    expect(onAdd).toHaveBeenCalledWith(producing.id, FOUND.values[0]);
  });

  it("has no Found tab for Evidence no Job produced", () => {
    const evidence = buildEvidenceRecord();
    render(
      <EvidenceDetail
        entityPort={emptyEntityPickerPort()}
        evidence={evidence}
        caseId={evidence.caseId}
        jobs={[]}
        actions={actions}
      />,
      { wrapper: Providers }
    );
    expect(
      screen.queryByRole("tab", { name: "Found" })
    ).not.toBeInTheDocument();
  });
});

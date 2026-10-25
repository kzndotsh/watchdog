import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EvidenceDetail } from "@/domains/intake/components/evidence-detail";
import type { IntakeEvidenceActions } from "@/domains/intake/hooks/use-intake-actions";
import {
  buildEvidenceRecord,
  buildProviderCallList,
  buildProviderCallRecord,
} from "@/testing/records";
import { RouteCaseProvider } from "@/testing/route-case";
import { testId } from "@watchdog/test-kit";

const listEvidenceProviderCallsFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/intake/intake.functions", () => ({
  listEvidenceProviderCallsFn,
  listEvidenceFn: vi.fn(),
  getEvidenceDownloadUrlFn: vi.fn(),
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

function renderEvidence() {
  const evidence = buildEvidenceRecord();
  render(
    <EvidenceDetail
      evidence={evidence}
      caseId={evidence.caseId}
      jobs={[]}
      actions={actions}
    />,
    { wrapper: Providers }
  );
  return evidence;
}

describe("EvidenceDetail provider calls", () => {
  beforeEach(() => {
    listEvidenceProviderCallsFn.mockReset();
  });

  it("reads the calls behind the Evidence once the Calls tab is open", async () => {
    const user = userEvent.setup();
    listEvidenceProviderCallsFn.mockResolvedValue(buildProviderCallList());

    const evidence = renderEvidence();

    expect(listEvidenceProviderCallsFn).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "Calls" }));

    expect(
      await screen.findByText("https://provider.test/v1/host?key=[redacted]")
    ).toBeInTheDocument();
    expect(listEvidenceProviderCallsFn).toHaveBeenCalledWith({
      data: { caseId: evidence.caseId, evidenceId: evidence.id },
    });
  });

  it("shows Evidence that came from a cache hit with its source Job", async () => {
    const user = userEvent.setup();
    listEvidenceProviderCallsFn.mockResolvedValue(
      buildProviderCallList({
        cacheHits: [{ jobId: testId(12), sourceJobId: testId(11) }],
      })
    );

    renderEvidence();
    await user.click(screen.getByRole("tab", { name: "Calls" }));

    expect(
      await screen.findByText(/this Evidence came from a cached result/)
    ).toBeInTheDocument();
    expect(screen.getByText("GET")).toBeInTheDocument();
  });

  it("shows incomplete provenance as such, not as no calls", async () => {
    const user = userEvent.setup();
    listEvidenceProviderCallsFn.mockResolvedValue(
      buildProviderCallList({
        provenance: "incomplete",
        calls: [],
      })
    );

    renderEvidence();
    await user.click(screen.getByRole("tab", { name: "Calls" }));

    expect(
      await screen.findByText(/provider-call record is incomplete/)
    ).toBeInTheDocument();
    expect(screen.queryByText("No provider calls recorded")).toBeNull();
  });

  it("shows a call that ended without a stored body without a download", async () => {
    const user = userEvent.setup();
    listEvidenceProviderCallsFn.mockResolvedValue(
      buildProviderCallList({
        calls: [
          buildProviderCallRecord({
            body: {
              kind: "response",
              state: "hashed",
              reason: "over_limit",
              sha256: "c".repeat(64),
              bytes: 5_000_000,
              contentType: "application/zip",
              isDownloadable: false,
            },
          }),
        ],
      })
    );

    renderEvidence();
    await user.click(screen.getByRole("tab", { name: "Calls" }));

    expect(
      await screen.findByText(/Not stored \(over the keep limit\)/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Download the raw response/ })
    ).toBeNull();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildEvidenceRecord, buildProposalRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/triage/components/triage-decide-header", () => ({
  TriageDecideHeader: () => <div>Triage decide header</div>,
}));

type BodyProps = {
  evidenceLoadError: string | null;
  isEvidenceLoading: boolean;
  missingJobEvidenceCount: number;
  evidenceById: ReadonlyMap<string, { id: string }>;
  linkedIds: string[];
};

const triagePatchBodyProps = vi.hoisted(() => vi.fn());

vi.mock("@/domains/triage/components/triage-patch-body", () => ({
  TriagePatchBody: (props: BodyProps) => {
    triagePatchBodyProps(props);
    return <div>Triage patch body</div>;
  },
}));

// The Detail's Evidence: titles by id and the searched picker, never the Case's whole list (#580).
vi.mock("@/domains/intake/intake.functions", () => ({
  getEvidenceManyFn: vi.fn(),
  listEvidencePageFn: vi.fn(),
  listEvidencePickerPageFn: vi.fn(),
}));

import {
  getEvidenceManyFn,
  listEvidencePageFn,
  listEvidencePickerPageFn,
} from "@/domains/intake/intake.functions";
import { TriageDetail } from "@/domains/triage/components/triage-detail";

const CASE_ID = testCaseId(10);
const CITED = [testId(41), testId(42)];

function renderDetail(
  proposal = buildProposalRecord({ evidenceIds: CITED, patch: [] })
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <TriageDetail
      proposal={proposal}
      caseId={CASE_ID}
      isPending={false}
      error={null}
      onAccept={vi.fn()}
      onReject={vi.fn()}
    />,
    { wrapper }
  );
}

function lastBodyProps(): BodyProps {
  const props = triagePatchBodyProps.mock.calls.at(-1)?.[0] as
    | BodyProps
    | undefined;
  if (props === undefined) throw new Error("the patch body never rendered");
  return props;
}

describe("TriageDetail", () => {
  beforeEach(() => {
    triagePatchBodyProps.mockClear();
    vi.mocked(getEvidenceManyFn).mockReset();
    vi.mocked(listEvidencePageFn).mockReset();
    vi.mocked(listEvidencePickerPageFn).mockReset();
  });

  it("shows empty detail copy when nothing is selected", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TriageDetail
          proposal={null}
          caseId={CASE_ID}
          isPending={false}
          error={null}
          onAccept={vi.fn()}
          onReject={vi.fn()}
        />
      </QueryClientProvider>
    );
    expect(screen.getByText("Select a proposal")).toBeInTheDocument();
    expect(getEvidenceManyFn).not.toHaveBeenCalled();
    expect(listEvidencePageFn).not.toHaveBeenCalled();
  });

  it("titles the cited Evidence by id and never reads the Case's Evidence list", async () => {
    vi.mocked(getEvidenceManyFn).mockResolvedValue([
      buildEvidenceRecord({ id: CITED[0], label: "Memo" }),
      buildEvidenceRecord({ id: CITED[1], label: "Hidden memo" }),
    ]);
    renderDetail();

    expect(screen.getByText("Triage decide header")).toBeInTheDocument();
    expect(screen.getByText("Triage patch body")).toBeInTheDocument();
    expect(lastBodyProps().isEvidenceLoading).toBe(true);
    await waitFor(() => {
      expect(lastBodyProps().evidenceById.size).toBe(2);
    });
    expect(lastBodyProps()).toMatchObject({
      isEvidenceLoading: false,
      evidenceLoadError: null,
      missingJobEvidenceCount: 0,
    });
    expect(getEvidenceManyFn).toHaveBeenCalledTimes(1);
    expect(getEvidenceManyFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, ids: [...CITED].sort() },
    });
    expect(listEvidencePageFn).not.toHaveBeenCalled();
    expect(listEvidencePickerPageFn).not.toHaveBeenCalled();
  });

  it("counts cited ids the Case does not hold once the read has answered", async () => {
    vi.mocked(getEvidenceManyFn).mockResolvedValue([
      buildEvidenceRecord({ id: CITED[0], label: "Memo" }),
    ]);
    renderDetail();

    await waitFor(() => {
      expect(lastBodyProps().missingJobEvidenceCount).toBe(1);
    });
  });

  it("reads nothing for a Proposal that cites no Evidence", () => {
    renderDetail(buildProposalRecord({ evidenceIds: [], patch: [] }));

    expect(lastBodyProps()).toMatchObject({
      isEvidenceLoading: false,
      evidenceLoadError: null,
    });
    expect(getEvidenceManyFn).not.toHaveBeenCalled();
  });

  it("holds an evidence error until the read settles, then reports it", async () => {
    vi.mocked(getEvidenceManyFn).mockRejectedValue(new Error("boom"));
    renderDetail();

    expect(lastBodyProps().evidenceLoadError).toBeNull();
    await waitFor(() => {
      expect(lastBodyProps().evidenceLoadError).toBe("Failed to load evidence");
    });
    expect(lastBodyProps().isEvidenceLoading).toBe(false);
  });
});

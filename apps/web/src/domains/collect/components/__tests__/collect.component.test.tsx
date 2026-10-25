// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import { testCaseId } from "@watchdog/schemas/testing";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
  Navigate: () => null,
}));

vi.mock("@/shared/layout/page", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/shared/layout/page-header", () => ({
  PageHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/domains/collect/components/collect-detail", () => ({
  CollectDetail: () => <div>Collect detail</div>,
}));

vi.mock("@/domains/collect/components/collect-queue-body", () => ({
  CollectQueueBody: () => <div>Collect queue</div>,
}));

vi.mock("@/domains/collect/components/collect-queue-toolbar", () => ({
  CollectQueueToolbar: ({ actions }: { actions: React.ReactNode }) => (
    <div>{actions}</div>
  ),
}));

vi.mock("@/shared/ui/split-view", () => ({
  SplitView: ({
    list,
    detail,
  }: {
    list: React.ReactNode;
    detail: React.ReactNode;
  }) => (
    <div>
      <div data-testid="split-list">{list}</div>
      <div data-testid="split-detail">{detail}</div>
    </div>
  ),
}));

vi.mock("@/domains/intake/components/dump-dialogs", () => ({
  DumpDialogs: () => null,
}));

vi.mock("@/domains/collect/components/collect-dump-buttons", () => ({
  CollectDumpButtons: () => null,
}));

vi.mock("@/domains/collect/components/collect-run-popover", () => ({
  CollectRunPopover: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="run-popover">{children}</div>
  ),
}));

const useQueryMock = vi.hoisted(() => vi.fn());
const useCollectWorkspaceMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
  };
});

vi.mock("@/domains/collect/hooks/use-collect-workspace", () => ({
  useCollectWorkspace: (...args: unknown[]) => useCollectWorkspaceMock(...args),
}));

import { Collect } from "@/domains/collect/components/collect";
import { renderIn } from "@/testing/render-in-case";

const ACTIVE: CaseRecord = {
  id: testCaseId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

const render = renderIn(ACTIVE);

function mockWorkspace() {
  useCollectWorkspaceMock.mockReturnValue({
    urlSyncOutOfDate: false,
    filters: { hiddenOnly: false, q: "" },
    setFilters: vi.fn(),
    jobs: [],
    actionError: null,
    dumpModal: null,
    setDumpModal: vi.fn(),
    runMode: "cap",
    setRunMode: vi.fn(),
    intake: {
      busy: false,
      uploading: false,
      dumpingPaste: false,
      dumpingUrl: false,
      uploadStatus: null,
      entityId: null,
      setEntityId: vi.fn(),
      onFiles: vi.fn(),
      onPaste: vi.fn(),
      onUrl: vi.fn(),
      evidenceActions: {},
    },
    entities: [],
    urlDumps: [],
    configuredCredentials: [],
    credentialsLoadError: null,
    credentialsPending: false,
    retryCredentials: vi.fn(),
    indexRows: [],
    visibleRows: [],
    selection: { rowId: null },
    selected: null,
    entityNameById: {},
    entityTitleById: {},
    evidenceTitleById: {},
    recipeTotal: null,
    detailPending: false,
    detailPlaceholder: false,
    handleQueueSelect: vi.fn(),
    jobsWs: {
      error: null,
      stuckJobs: [],
      cancelBusy: false,
      cancelPlaybookBusy: false,
      handleCancel: vi.fn(),
      hasPlaybookRun: false,
      handleCancelPlaybook: vi.fn(),
      handleRunPlaybook: vi.fn(),
      handleRunCap: vi.fn(),
      detailLoadError: null,
      handleRetryDetail: vi.fn(),
      detailJob: null,
      runSiblings: [],
    },
    retryQueue: vi.fn(),
    queueCorePending: false,
    queuePending: false,
    queuePlaceholder: false,
    queueLoadError: null,
  });
}

function renderCollect() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Collect onIdChange={vi.fn()} />
    </QueryClientProvider>
  );
}

describe("Collect", () => {
  it("shows catalog loading instead of an error while playbooks are still pending", () => {
    useQueryMock.mockImplementation(
      (opts: { queryKey?: readonly string[] }) => {
        if (opts.queryKey?.[0] === "capabilities") {
          return {
            data: undefined,
            isError: true,
            error: new Error("Caps unavailable"),
            isFetched: true,
            isLoading: false,
          };
        }
        return {
          data: undefined,
          isError: false,
          isFetched: false,
          isLoading: true,
        };
      }
    );
    mockWorkspace();

    renderCollect();

    expect(screen.getByText("Loading caps and playbooks…")).toBeInTheDocument();
    expect(screen.queryByText("Caps unavailable")).not.toBeInTheDocument();
  });

  it("stretches the detail column so the footer can sit at the bottom", () => {
    useQueryMock.mockImplementation(
      (opts: { queryKey?: readonly string[] }) => ({
        data:
          opts.queryKey?.[0] === "cases"
            ? { cases: [ACTIVE], active: ACTIVE }
            : [],
        isError: false,
        isFetched: true,
        isLoading: false,
        isPlaceholderData: false,
      })
    );
    mockWorkspace();

    renderCollect();

    const detail = screen.getByText("Collect detail");
    expect(detail.parentElement).toHaveClass("h-full", "flex-1");
  });
});

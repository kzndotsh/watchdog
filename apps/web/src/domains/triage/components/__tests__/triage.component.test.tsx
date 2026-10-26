// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect, useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import type { ProposalRecord } from "@watchdog/core/proposals";
import { proposalList } from "@watchdog/schemas/jobs";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

vi.mock("@watchdog/ui/components/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

/** What the screen's `<Navigate>` writes: the harness applies it as the router would. */
const navigateTo = vi.hoisted(() => ({
  current: (_search: Record<string, unknown>) => {},
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  Navigate: ({ search }: { search: Record<string, unknown> }) => {
    useLayoutEffect(() => {
      navigateTo.current(search);
    });
    return null;
  },
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

vi.mock("@/domains/triage/components/triage-detail", () => ({
  TriageDetail: ({
    proposal,
    onAccept,
    onReject,
  }: {
    proposal: ProposalRecord | null;
    onAccept: (values: {
      confidence: "possible";
      evidenceIds: string[];
      attestationText: string;
    }) => void;
    onReject: (reason: string) => void;
  }) => (
    <section aria-label="Proposal detail">
      <p>
        {proposal === null
          ? "Nothing selected"
          : `Detail: ${proposal.summary ?? ""}`}
      </p>
      <button
        type="button"
        onClick={() => {
          onAccept({
            confidence: "possible",
            evidenceIds: [],
            attestationText: "",
          });
        }}
      >
        Accept
      </button>
      <button
        type="button"
        onClick={() => {
          onReject("dup");
        }}
      >
        Reject
      </button>
    </section>
  ),
}));

const listProposalsPageFn = vi.hoisted(() => vi.fn());
const getProposalFn = vi.hoisted(() => vi.fn());
const acceptProposalFn = vi.hoisted(() => vi.fn());
const rejectProposalFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/triage/triage.functions", () => ({
  listProposalsPageFn,
  getProposalFn,
  acceptProposalFn,
  rejectProposalFn,
}));

import { Triage } from "@/domains/triage/components/triage";
import {
  triageSearchSchema,
  type TriageSearch,
} from "@/domains/triage/lib/triage-search";
import { TOAST_PROPOSAL_SELECTION_GONE } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";
import { preloadListPopovers } from "@/testing/list-popovers";
import { matchesChoice, matchesQ, memoryListPage } from "@/testing/memory-list";
import { buildProposalRecord } from "@/testing/records";
import { renderIn } from "@/testing/render-in-case";

const ACTIVE: CaseRecord = {
  id: testCaseId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

const render = renderIn(ACTIVE);

const STATUSES = ["pending", "accepted", "rejected"] as const;

/** `count` Proposals, `n` minutes apart, statuses in turn: p0 pending, p1 accepted, p2 rejected. */
function proposals(count: number): ProposalRecord[] {
  return Array.from({ length: count }, (_, n) =>
    buildProposalRecord({
      id: testId(5000 + n),
      caseId: ACTIVE.id,
      status: STATUSES[n % 3],
      summary: `Proposal ${String(n).padStart(2, "0")}`,
      createdAt: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString(),
    })
  );
}

function proposalServer(rows: readonly ProposalRecord[], pageSize = 50) {
  return memoryListPage(rows, {
    matches: (row, data) =>
      matchesChoice(row.status, data.status) &&
      matchesQ(data, [row.summary, row.rejectReason]),
    compare: (sort) => (a, b) =>
      sort === "created.asc"
        ? a.createdAt.localeCompare(b.createdAt)
        : b.createdAt.localeCompare(a.createdAt),
    pageSize,
  });
}

type Patch = Readonly<Record<string, unknown>>;

/** The route's part: the search in "the URL" (state here), patched as `usePatchSearch` does. */
function Screen({
  initial,
  onPatch,
}: {
  initial: TriageSearch;
  onPatch: (patch: Patch) => void;
}) {
  const [search, setSearch] = useState(initial);
  const patch = (next: Patch) => {
    onPatch(next);
    setSearch((prev) => ({ ...prev, ...next }));
  };
  useLayoutEffect(() => {
    navigateTo.current = (next) => {
      setSearch(triageSearchSchema.parse(next));
    };
  }, []);
  return <Triage search={search} onSearchChange={patch} />;
}

function renderTriage(
  rows: readonly ProposalRecord[],
  initial: TriageSearch = { status: ["pending"] },
  { pageSize = 50 }: { pageSize?: number } = {}
) {
  listProposalsPageFn.mockReset();
  listProposalsPageFn.mockImplementation(proposalServer(rows, pageSize));
  getProposalFn.mockReset();
  getProposalFn.mockImplementation(
    async ({ data }: { data: { proposalId: string } }) =>
      rows.find((row) => row.id === data.proposalId) ?? null
  );
  acceptProposalFn.mockReset();
  acceptProposalFn.mockResolvedValue(rows[0]);
  rejectProposalFn.mockReset();
  rejectProposalFn.mockResolvedValue(rows[0]);
  const onPatch = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Screen initial={initial} onPatch={onPatch} />
    </QueryClientProvider>
  );
  return { onPatch };
}

function lastRequest(): Record<string, unknown> {
  const call = listProposalsPageFn.mock.calls.at(-1) as
    | [{ data: Record<string, unknown> }]
    | undefined;
  if (call === undefined) throw new Error("no page was asked for");
  return call[0].data;
}

function queueRows(): HTMLElement[] {
  return within(
    screen.getByRole("listbox", { name: "Proposals" })
  ).getAllByRole("option");
}

beforeAll(preloadListPopovers);

describe("Triage", () => {
  it("opens on the pending view the link carries: one page, its total, the first row selected", async () => {
    renderTriage(proposals(9));

    expect(await screen.findByText("Showing 3")).toBeInTheDocument();
    expect(listProposalsPageFn).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toEqual({ caseId: ACTIVE.id, status: ["pending"] });
    // Newest first: p6, p3, p0. The first is selected and written to the URL.
    expect(queueRows().map((row) => row.textContent)).toEqual([
      expect.stringContaining("Proposal 06"),
      expect.stringContaining("Proposal 03"),
      expect.stringContaining("Proposal 00"),
    ]);
    expect(await screen.findByText("Detail: Proposal 06")).toBeInTheDocument();
    expect(getProposalFn).not.toHaveBeenCalled();
  });

  it("searches on the server and writes `q` to the URL", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderTriage(proposals(9));
    await screen.findByText("Showing 3");

    await user.click(
      screen.getByRole("searchbox", { name: "Search proposals" })
    );
    await user.paste("Proposal 03");
    await user.tab();

    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ q: "Proposal 03" })
    );
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({
        status: ["pending"],
        q: "Proposal 03",
      });
    });
    expect(await screen.findByText("Showing 1")).toBeInTheDocument();
  });

  it("filters by Status from the Filters popover", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderTriage(proposals(9), {});
    expect(await screen.findByText("Showing 9")).toBeInTheDocument();
    expect(lastRequest()).toEqual({ caseId: ACTIVE.id });

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(await screen.findByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("combobox", { name: "Status values" }));
    await user.click(await screen.findByRole("option", { name: "Rejected" }));
    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: ["rejected"] })
    );
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ status: ["rejected"] });
    });
    expect(await screen.findByText("Showing 3")).toBeInTheDocument();
  });

  it("sorts from Display options", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderTriage(proposals(9), { status: ["rejected"] });
    expect(await screen.findByText("Showing 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Display options" }));
    await user.click(
      await screen.findByRole("radio", { name: /Created, Oldest/ })
    );
    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "created.asc" })
    );
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({
        status: ["rejected"],
        sort: "created.asc",
      });
    });
  });

  it("pages with Load more, and j / k walk on into the new rows", async () => {
    const user = userEvent.setup();
    renderTriage(proposals(12), {}, { pageSize: 5 });
    expect(await screen.findByText("Showing 5 of 12")).toBeInTheDocument();
    await screen.findByText("Detail: Proposal 11");

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 10 of 12")).toBeInTheDocument();
    expect(lastRequest()).toMatchObject({ cursor: "5" });

    // Walk from the first row to the sixth, the first of the new page.
    for (let step = 0; step < 5; step += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one key at a time, as a reviewer types
      await user.keyboard("j");
    }
    expect(await screen.findByText("Detail: Proposal 06")).toBeInTheDocument();
    await user.keyboard("k");
    expect(await screen.findByText("Detail: Proposal 07")).toBeInTheDocument();
  });

  it("opens the view the URL names, chips and all, and its URL round-trips", async () => {
    const url: TriageSearch = {
      status: ["rejected"],
      q: "Proposal 0",
      sort: "created.asc",
    };
    renderTriage(proposals(12), url);

    expect(await screen.findByText("Showing 3")).toBeInTheDocument();
    expect(listProposalsPageFn).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toEqual({ caseId: ACTIVE.id, ...url });
    const chips = screen.getByRole("group", { name: "Active filters" });
    expect(within(chips).getByText("Status: Rejected")).toBeInTheDocument();

    const query = proposalList.queryOf(triageSearchSchema.parse(url));
    expect(
      proposalList.queryOf(
        triageSearchSchema.parse(proposalList.toSearch(query))
      )
    ).toEqual(query);
  });

  it("says “No proposals yet” only when the Case has none, with the way to Collect", async () => {
    renderTriage([], {});
    expect(await screen.findByText("No Proposals Yet")).toBeInTheDocument();
    expect(screen.getByText("Open Collect")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing Matches/)).not.toBeInTheDocument();
  });

  it("says “Nothing matches these filters” on an empty pending view, and Clear shows every status", async () => {
    const user = userEvent.setup();
    const decided = proposals(3).filter((row) => row.status !== "pending");
    const { onPatch } = renderTriage(decided);
    expect(
      await screen.findByText("Nothing Matches These Filters")
    ).toBeInTheDocument();
    expect(screen.queryByText("No Proposals Yet")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: undefined })
    );
    expect(await screen.findByText("Showing 2")).toBeInTheDocument();
  });

  it("opens a URL-selected Proposal that is not on the first page by id", async () => {
    const rows = proposals(12);
    const target = rows[1];
    if (target === undefined) throw new Error("fixture");
    // An accepted Proposal under the pending view: never on a loaded page.
    renderTriage(rows, { status: ["pending"], proposalId: target.id });

    expect(await screen.findByText("Detail: Proposal 01")).toBeInTheDocument();
    expect(getProposalFn).toHaveBeenCalledTimes(1);
    expect(getProposalFn).toHaveBeenLastCalledWith({
      data: { caseId: ACTIVE.id, proposalId: target.id },
    });
  });

  it("clears a selection the Case no longer holds, with a notice", async () => {
    const { onPatch } = renderTriage(proposals(3), {
      status: ["pending"],
      proposalId: testId(9999),
    });

    await waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith({ proposalId: undefined });
    });
    expect(toast.info).toHaveBeenCalledWith(TOAST_PROPOSAL_SELECTION_GONE);
    expect(await screen.findByText("Detail: Proposal 00")).toBeInTheDocument();
  });

  it("shows Retry and Clear selection when the by-id read fails", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderTriage(proposals(3), {
      status: ["pending"],
      proposalId: testId(9999),
    });
    getProposalFn.mockReset();
    getProposalFn.mockRejectedValue(new Error("boom"));

    expect(await screen.findByText("boom")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onPatch).toHaveBeenLastCalledWith({ proposalId: undefined });
  });

  it("accepts the selected Proposal and goes back to the pending view", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderTriage(proposals(9), {
      status: ["pending", "rejected"],
      q: "Proposal",
    });
    await screen.findByText("Detail: Proposal 08");

    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(acceptProposalFn).toHaveBeenCalledTimes(1);
    });
    expect(acceptProposalFn).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        caseId: ACTIVE.id,
        proposalId: testId(5008),
      }),
    });
    await waitFor(() => {
      expect(onPatch).toHaveBeenLastCalledWith({
        status: ["pending"],
        q: undefined,
      });
    });
    expect(toast.success).toHaveBeenCalledWith("Proposal accepted");
  });

  it("rejects the selected Proposal with the reason", async () => {
    const user = userEvent.setup();
    renderTriage(proposals(3));
    await screen.findByText("Detail: Proposal 00");

    await user.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => {
      expect(rejectProposalFn).toHaveBeenLastCalledWith({
        data: {
          caseId: ACTIVE.id,
          proposalId: testId(5000),
          reason: "dup",
        },
      });
    });
  });
});

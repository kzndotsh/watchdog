// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect, useState } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import type { CollectQueueItem } from "@watchdog/core/jobs";
import { collectList } from "@watchdog/schemas/jobs";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

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
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/" }, matches: [] }),
}));

const listCollectPageFn = vi.hoisted(() => vi.fn());
const getCollectItemFn = vi.hoisted(() => vi.fn());
const getJobFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/collect/collect.functions", () => ({
  listCollectPageFn,
  getCollectItemFn,
}));

vi.mock("@/domains/jobs/jobs.functions", () => ({
  listCapabilitiesFn: async () => [],
  listPlaybooksFn: async () => [],
  getJobFn,
  getPlaybookRunFn: async () => null,
  startJobFn: vi.fn(),
  startPlaybookFn: vi.fn(),
  cancelJobFn: vi.fn(),
  cancelPlaybookFn: vi.fn(),
  retryJobFn: vi.fn(),
}));

vi.mock("@/domains/settings/settings.functions", () => ({
  listCredentialsFn: async () => [],
}));

vi.mock("@/domains/entities/entities.functions", () => ({
  listEntitiesPickerPageFn: async () => ({
    items: [],
    nextCursor: null,
    total: null,
  }),
  getEntitiesFn: async () => [],
  getEntityBySlugFn: async () => null,
}));

import { Collect } from "@/domains/collect/components/collect";
import {
  collectSearchSchema,
  type CollectSearch,
} from "@/domains/collect/lib/collect-search";
import { TOAST_COLLECT_SELECTION_GONE } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";
import { matchesChoice, matchesQ, memoryListPage } from "@/testing/memory-list";
import { buildJobListRecord, buildJobRecord } from "@/testing/records";
import { renderIn } from "@/testing/render-in-case";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";

const ACTIVE: CaseRecord = {
  id: testCaseId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

const render = renderIn(ACTIVE);

const STATES = ["queued", "failed", "landed"] as const;

/** `count` lone-Job rows, `n` minutes apart, states in turn: row 0 queued, 1 failed, 2 landed. */
function rows(count: number): CollectQueueItem[] {
  return Array.from({ length: count }, (_, n) => {
    const at = new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString();
    const id = testId(7000 + n);
    return {
      id,
      kind: "job",
      state: STATES[n % 3],
      sortAt: at,
      activityAt: at,
      entityId: null,
      capabilityIds: ["network.dns.lookup"],
      playbookRunId: null,
      evidence: null,
      jobs: [
        buildJobListRecord({
          id,
          caseId: ACTIVE.id,
          input: { host: `host-${String(n).padStart(2, "0")}.test` },
          createdAt: at,
          updatedAt: at,
        }),
      ],
      titles: { evidence: {}, entity: {} },
    };
  });
}

function hostOf(row: CollectQueueItem): string {
  const host = row.jobs[0]?.input?.host;
  return typeof host === "string" ? host : "";
}

function collectServer(all: readonly CollectQueueItem[], pageSize = 50) {
  return memoryListPage(all, {
    matches: (row, data) =>
      matchesChoice(row.state, data.state) && matchesQ(data, [hostOf(row)]),
    compare: (sort) => (a, b) =>
      sort === "started.asc"
        ? a.sortAt.localeCompare(b.sortAt)
        : b.activityAt.localeCompare(a.activityAt),
    pageSize,
  });
}

type Patch = Readonly<Record<string, unknown>>;

/** The route's part: the search in "the URL" (state here), patched as `usePatchSearch` does. */
function Screen({
  initial,
  onPatch,
}: {
  initial: CollectSearch;
  onPatch: (patch: Patch) => void;
}) {
  const [search, setSearch] = useState(initial);
  const patch = (next: Patch) => {
    onPatch(next);
    setSearch((prev) => ({ ...prev, ...next }));
  };
  useLayoutEffect(() => {
    navigateTo.current = (next) => {
      setSearch(collectSearchSchema.parse(next));
    };
  }, []);
  return <Collect search={search} onSearchChange={patch} />;
}

function renderCollect(
  all: readonly CollectQueueItem[],
  initial: CollectSearch = {},
  { pageSize = 50 }: { pageSize?: number } = {}
) {
  listCollectPageFn.mockReset();
  listCollectPageFn.mockImplementation(collectServer(all, pageSize));
  getCollectItemFn.mockReset();
  getCollectItemFn.mockImplementation(
    async ({ data }: { data: { id: string } }) => {
      const item = all.find(
        (row) =>
          row.id === data.id || row.jobs.some((job) => job.id === data.id)
      );
      return item === undefined
        ? null
        : { item, focusJobId: item.id === data.id ? null : data.id };
    }
  );
  getJobFn.mockReset();
  getJobFn.mockImplementation(async ({ data }: { data: { jobId: string } }) =>
    buildJobRecord({ id: data.jobId, caseId: ACTIVE.id })
  );
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
  const call = listCollectPageFn.mock.calls.at(-1) as
    | [{ data: Record<string, unknown> }]
    | undefined;
  if (call === undefined) throw new Error("no page was asked for");
  return call[0].data;
}

function queueRows(): HTMLElement[] {
  return within(
    screen.getByRole("listbox", { name: "Collect items" })
  ).getAllByRole("option");
}

class ResizeObserverDouble {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(preloadSharedLazyChunks);

beforeEach(() => {
  // The resizable split view measures its panes; jsdom has neither (the config unstubs after each test).
  vi.stubGlobal("ResizeObserver", ResizeObserverDouble);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

describe("Collect screen", () => {
  it("opens on one page with its total, newest activity first, and the first row selected and written to the URL", async () => {
    renderCollect(rows(6));

    expect(await screen.findByText("Showing 6")).toBeInTheDocument();
    expect(listCollectPageFn).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toEqual({ caseId: ACTIVE.id });
    expect(queueRows()[0]?.textContent).toContain("host-05.test");
    await waitFor(() => {
      expect(queueRows()[0]).toHaveAttribute("aria-selected", "true");
    });
  });

  it("searches on the server and writes `q` to the URL", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderCollect(rows(6));
    await screen.findByText("Showing 6");

    // `/` focuses the search box from anywhere outside a field.
    await user.keyboard("/");
    await user.paste("host-03");
    await user.tab();

    await waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith(
        expect.objectContaining({ q: "host-03" })
      );
    });
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ q: "host-03" });
    });
    expect(await screen.findByText("Showing 1")).toBeInTheDocument();
  });

  it("filters from the Filters popover, and drops a selection the Hidden view cannot hold", async () => {
    const user = userEvent.setup();
    const all = rows(6);
    const { onPatch } = renderCollect(all, { id: all[0]?.id });
    await screen.findByText("Showing 6");

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(await screen.findByRole("button", { name: "Add filter" }));
    // The first offered filter is Hidden (declaration order).
    await user.click(screen.getByRole("switch", { name: "Hidden only" }));

    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ hidden: true, id: undefined })
    );
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ hidden: true });
    });
  });

  it("sorts from Display options, and the moving key offers no oldest-first", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderCollect(rows(6));
    await screen.findByText("Showing 6");

    await user.click(screen.getByRole("button", { name: "Display options" }));
    expect(
      screen.queryByRole("radio", { name: /Latest activity, Oldest/ })
    ).not.toBeInTheDocument();
    await user.click(
      await screen.findByRole("radio", { name: /Started, Oldest/ })
    );

    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "started.asc" })
    );
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ sort: "started.asc" });
    });
  });

  it("pages with Load more, and j / k walk on into the new rows", async () => {
    const user = userEvent.setup();
    renderCollect(rows(12), {}, { pageSize: 5 });
    expect(await screen.findByText("Showing 5 of 12")).toBeInTheDocument();
    await waitFor(() => {
      expect(queueRows()[0]).toHaveAttribute("aria-selected", "true");
    });

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 10 of 12")).toBeInTheDocument();
    expect(lastRequest()).toMatchObject({ cursor: "5" });

    // From the first row to the sixth, the first of the second page.
    for (let step = 0; step < 5; step += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one key at a time, as a reviewer types
      await user.keyboard("j");
    }
    await waitFor(() => {
      expect(queueRows()[5]).toHaveAttribute("aria-selected", "true");
    });
    expect(queueRows()[5]?.textContent).toContain("host-06.test");
  });

  it("opens the view the URL names, chips and all, and its URL round-trips", async () => {
    const url: CollectSearch = {
      kind: ["job"],
      q: "host",
      sort: "started.asc",
    };
    renderCollect(rows(12), url);

    expect(await screen.findByText("Showing 12")).toBeInTheDocument();
    expect(listCollectPageFn).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toEqual({ caseId: ACTIVE.id, ...url });
    const chips = screen.getByRole("group", { name: "Active filters" });
    expect(within(chips).getByText("Kind: Job")).toBeInTheDocument();

    const query = collectList.queryOf(collectSearchSchema.parse(url));
    expect(
      collectList.queryOf(
        collectSearchSchema.parse(collectList.toSearch(query))
      )
    ).toEqual(query);
  });

  it("says “No items yet” only when the Case has none, with the ingress actions", async () => {
    renderCollect([]);
    expect(await screen.findByText("No Items Yet")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing Matches/)).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Paste" }).length
    ).toBeGreaterThan(0);
  });

  it("says “Nothing matches these filters” when a filter leaves nothing, and Clear shows every row", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderCollect(rows(3), { q: "nope" });
    expect(
      await screen.findByText("Nothing Matches These Filters")
    ).toBeInTheDocument();
    expect(screen.queryByText("No Items Yet")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: undefined })
    );
    expect(await screen.findByText("Showing 3")).toBeInTheDocument();
  });

  it("opens a Job link on its row without rewriting the URL", async () => {
    const all = rows(3);
    const target = all[1];
    if (target === undefined) throw new Error("fixture");
    const { onPatch } = renderCollect(all, { id: target.jobs[0]?.id });

    await waitFor(() => {
      expect(
        queueRows().find((row) => row.getAttribute("aria-selected") === "true")
          ?.textContent
      ).toContain("host-01.test");
    });
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("reads a selected row that is not on the first page by id", async () => {
    const all = rows(12);
    const target = all[0];
    if (target === undefined) throw new Error("fixture");
    // The oldest row: past the first page of five.
    renderCollect(all, { id: target.id }, { pageSize: 5 });

    await waitFor(() => {
      expect(getCollectItemFn).toHaveBeenCalledTimes(1);
    });
    expect(getCollectItemFn).toHaveBeenLastCalledWith({
      data: { caseId: ACTIVE.id, id: target.id },
    });
    expect(
      queueRows().some((row) => row.getAttribute("aria-selected") === "true")
    ).toBe(false);
  });

  it("clears a selection the Case no longer holds, with a notice", async () => {
    const { onPatch } = renderCollect(rows(3), { id: testId(9999) });

    await waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith({ id: undefined });
    });
    expect(toast.info).toHaveBeenCalledWith(TOAST_COLLECT_SELECTION_GONE);
  });
});

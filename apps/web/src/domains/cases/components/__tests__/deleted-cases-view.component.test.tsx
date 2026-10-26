import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeletedCaseRecord } from "@/domains/cases/types";
import { toast } from "@/shared/ui/toast";
import { preloadListPopovers } from "@/testing/list-popovers";
import { matchesQ, memoryListPage } from "@/testing/memory-list";
import {
  buildDeletedCaseRecord,
  buildRestoredCaseRecord,
} from "@/testing/records";
import { deletedCaseList } from "@watchdog/schemas/cases";
import type { ListSearch } from "@watchdog/schemas/shared";
import { testCaseId } from "@watchdog/schemas/testing";

const fns = vi.hoisted(() => ({
  listDeletedCasesPageFn: vi.fn(),
  restoreCaseFn: vi.fn(),
  purgeCaseFn: vi.fn(),
  getDeletionPolicyFn: vi.fn(),
}));

vi.mock("@/domains/cases/cases.functions", () => ({
  listDeletedCasesPageFn: fns.listDeletedCasesPageFn,
  restoreCaseFn: fns.restoreCaseFn,
  purgeCaseFn: fns.purgeCaseFn,
  getDeletionPolicyFn: fns.getDeletionPolicyFn,
  getCasesContextFn: vi.fn(),
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
  getDeletedCaseBySlugFn: vi.fn(),
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { DeletedCasesView } from "@/domains/cases/components/deleted-cases-view";
import {
  createTestRouter,
  destroyTestRouter,
  testRouterWrapper,
} from "@/testing/test-router";
import { SidebarProvider } from "@watchdog/ui/components/sidebar";

const ALPHA = buildDeletedCaseRecord({
  id: testCaseId(1),
  name: "Alpha Case",
  slug: "alpha",
  daysLeft: 12,
});
const BETA = buildDeletedCaseRecord({
  id: testCaseId(2),
  name: "Beta Case",
  slug: "beta",
  deletedByName: null,
  daysLeft: 1,
  deletedAt: "2026-10-02T12:00:00.000Z",
});

type Search = ListSearch<typeof deletedCaseList>;
type Patch = Readonly<Record<string, unknown>>;

/** The server's side of the list over `rows()`, read at each call so a restore can drop a row. */
function listServer(rows: () => readonly DeletedCaseRecord[]) {
  return async (arg: { data: Readonly<Record<string, unknown>> }) =>
    memoryListPage(rows(), {
      matches: (row, data) =>
        (data.purging !== true || row.purging) &&
        matchesQ(data, [row.name, row.slug, row.description]),
      compare: (sort) => (a, b) => {
        if (sort === "name.asc") return a.name.localeCompare(b.name);
        if (sort === "name.desc") return b.name.localeCompare(a.name);
        if (sort === "deleted.asc") {
          return a.deletedAt.localeCompare(b.deletedAt);
        }
        return b.deletedAt.localeCompare(a.deletedAt);
      },
      pageSize: 3,
    })(arg);
}

/** The route's part: the view in "the URL" (state here), as `usePatchSearch` patches it. */
function Route({
  initial,
  onPatch,
}: {
  initial: Search;
  onPatch: (patch: Patch) => void;
}) {
  const [search, setSearch] = useState<Search>(initial);
  return (
    <DeletedCasesView
      search={search}
      onSearchChange={(patch) => {
        onPatch(patch);
        setSearch((prev) => ({ ...prev, ...patch }));
      }}
    />
  );
}

let served: DeletedCaseRecord[] = [];

function renderView(initial: Search = {}) {
  const router = createTestRouter();
  const client = new QueryClient({
    defaultOptions: {
      // The list retries a failed page once (its own `retry`): at once, not after a second.
      queries: { retry: false, retryDelay: 0 },
      mutations: { retry: false },
    },
  });
  const onPatch = vi.fn();
  const RouterWrapper = testRouterWrapper(router);
  render(
    <QueryClientProvider client={client}>
      <SidebarProvider>
        <Route initial={initial} onPatch={onPatch} />
      </SidebarProvider>
    </QueryClientProvider>,
    { wrapper: RouterWrapper }
  );
  return { router, onPatch };
}

function lastRequest(): Record<string, unknown> {
  const call: unknown = fns.listDeletedCasesPageFn.mock.lastCall?.[0];
  if (typeof call !== "object" || call === null || !("data" in call)) {
    throw new Error("no list request yet");
  }
  const { data } = call;
  if (typeof data !== "object" || data === null) throw new Error("no data");
  return { ...data };
}

/** The names of the listed Cases, top to bottom. */
function rowNames(): string[] {
  return screen
    .getAllByRole("button", { name: "Purge now" })
    .map(
      (button) => button.closest("li")?.querySelector("p")?.textContent ?? ""
    );
}

/** `count` Cases deleted a day apart, newest is the highest number. */
function manyDeleted(count: number): DeletedCaseRecord[] {
  return Array.from({ length: count }, (_, n) =>
    buildDeletedCaseRecord({
      id: testCaseId(100 + n),
      name: `Case ${String(n).padStart(2, "0")}`,
      slug: `case-${String(n)}`,
      deletedAt: new Date(Date.UTC(2026, 9, 1) + n * 86_400_000).toISOString(),
      purging: n % 5 === 0,
    })
  );
}

beforeAll(preloadListPopovers);

describe("DeletedCasesView", () => {
  beforeEach(() => {
    served = [ALPHA, BETA];
    fns.listDeletedCasesPageFn
      .mockReset()
      .mockImplementation(listServer(() => served));
    fns.restoreCaseFn
      .mockReset()
      .mockResolvedValue(
        buildRestoredCaseRecord({ id: ALPHA.id, name: "Alpha Case" })
      );
    fns.purgeCaseFn.mockReset().mockResolvedValue(undefined);
    fns.getDeletionPolicyFn.mockReset().mockResolvedValue({
      restoreWindowDays: 30,
      canIncludeBreachCredentials: false,
      canManage: true,
      cancellableJobs: 0,
    });
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("shows a loading state while the list is fetched", async () => {
    let finish: () => void = () => undefined;
    fns.listDeletedCasesPageFn.mockReturnValue(
      new Promise((resolve) => {
        finish = () => {
          resolve({
            items: [],
            nextCursor: null,
            total: { count: 0, isCapped: false },
          });
        };
      })
    );
    renderView();
    expect(screen.getByText("Loading deleted Cases")).toBeInTheDocument();
    finish();
    expect(await screen.findByText("No Deleted Cases Yet")).toBeInTheDocument();
  });

  it("lists each deleted Case with who deleted it, when, and how long is left to restore", async () => {
    renderView();

    expect(await screen.findByText("Alpha Case")).toBeInTheDocument();
    expect(screen.getByText("Beta Case")).toBeInTheDocument();
    expect(screen.getByText(/by Ada Owner/)).toBeInTheDocument();
    expect(screen.getByText(/12 days left to restore/)).toBeInTheDocument();
    // A user who is gone or unknown reads as a neutral phrase, never a raw id.
    expect(screen.getByText(/by an unknown user/)).toBeInTheDocument();
    expect(screen.getByText(/1 day left to restore/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Purge now" })).toHaveLength(
      2
    );
    expect(
      await screen.findByText(/can be restored for 30 days/)
    ).toBeInTheDocument();
  });

  it("restates the restore window in the blank state", async () => {
    served = [];
    renderView();

    expect(await screen.findByText("No Deleted Cases Yet")).toBeInTheDocument();
    expect(
      await screen.findByText(/waits here for 30 days before it is purged/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nothing Matches/)).not.toBeInTheDocument();
  });

  it("shows the failure with a retry that asks again", async () => {
    // The list retries a failed page once before it shows the error.
    fns.listDeletedCasesPageFn
      .mockRejectedValueOnce(new Error("database down"))
      .mockRejectedValueOnce(new Error("database down"));
    renderView();

    expect(await screen.findByText("database down")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Alpha Case")).toBeInTheDocument();
  });

  it("restores a Case, tells the user, and refreshes the list", async () => {
    renderView();
    const row = (await screen.findByText("Alpha Case")).closest("li")!;

    served = [BETA];
    await userEvent.click(within(row).getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(fns.restoreCaseFn).toHaveBeenCalledWith({
        data: { caseId: ALPHA.id },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "\u201CAlpha Case\u201D restored"
      );
    });
    await waitFor(() => {
      expect(screen.queryByText("Alpha Case")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Beta Case")).toBeInTheDocument();
  });

  it("reports a restore the server refused", async () => {
    fns.restoreCaseFn.mockRejectedValue(
      new Error("This Case is being purged and can no longer be restored")
    );
    renderView();
    const row = (await screen.findByText("Alpha Case")).closest("li")!;

    await userEvent.click(within(row).getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "This Case is being purged and can no longer be restored"
      );
    });
    expect(screen.getByText("Alpha Case")).toBeInTheDocument();
  });

  it("cannot restore a Case whose window has ended", async () => {
    served = [
      buildDeletedCaseRecord({
        id: testCaseId(4),
        name: "Late Case",
        daysLeft: 0,
      }),
    ];
    renderView();

    await screen.findByText("Late Case");
    expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled();
    expect(screen.getByText(/Restore window ended/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Purge now" })).toBeEnabled();
  });

  it("cannot restore a Case whose purge has begun, and shows the failed purge", async () => {
    served = [
      buildDeletedCaseRecord({
        id: testCaseId(3),
        name: "Stuck Case",
        purging: true,
        purgeError: "store down",
      }),
    ];
    renderView();

    await screen.findByText("Stuck Case");
    expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled();
    expect(screen.getByText(/Purge in progress/)).toBeInTheDocument();
    expect(screen.getByText(/last purge attempt failed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Purge now" })).toBeEnabled();
  });

  it("purges only after the Case name is typed, and explains that it is permanent", async () => {
    renderView();
    const row = (await screen.findByText("Alpha Case")).closest("li")!;

    await userEvent.click(
      within(row).getByRole("button", { name: "Purge now" })
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByRole("heading", { name: "Purge case" })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/erased for good and cannot be restored/)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Only a short deletion record stays/)
    ).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Purge case" });
    expect(confirm).toBeDisabled();

    await userEvent.type(within(dialog).getByRole("textbox"), "Alpha");
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByRole("textbox"), " Case");
    expect(confirm).toBeEnabled();
    expect(fns.purgeCaseFn).not.toHaveBeenCalled();

    served = [BETA];
    await userEvent.click(confirm);

    await waitFor(() => {
      expect(fns.purgeCaseFn).toHaveBeenCalledWith({
        data: { caseId: ALPHA.id },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Case purged");
    });
    await waitFor(() => {
      expect(screen.queryByText("Alpha Case")).not.toBeInTheDocument();
    });
  });

  it("keeps the purge confirmation open with the failure inside it", async () => {
    fns.purgeCaseFn.mockRejectedValue(new Error("Failed to purge Case"));
    renderView();
    const row = (await screen.findByText("Alpha Case")).closest("li")!;
    await userEvent.click(
      within(row).getByRole("button", { name: "Purge now" })
    );
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "Alpha Case");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Purge case" })
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Failed to purge Case"
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  describe("the list standard", () => {
    it("reads one page at a time and loads more through the standard footer", async () => {
      const user = userEvent.setup();
      served = manyDeleted(7);
      renderView();
      expect(await screen.findByText("Showing 3 of 7")).toBeInTheDocument();
      expect(fns.listDeletedCasesPageFn).toHaveBeenCalledTimes(1);
      expect(lastRequest()).toEqual({});
      // Newest deletion first, the declared default.
      expect(rowNames()[0]).toBe("Case 06");
      expect(
        screen.queryByRole("button", { name: "Show more" })
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Load more" }));
      expect(await screen.findByText("Showing 6 of 7")).toBeInTheDocument();
      expect(lastRequest()).toMatchObject({ cursor: "3" });
      await user.click(screen.getByRole("button", { name: "Load more" }));
      expect(await screen.findByText("Showing 7")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Load more" })
      ).not.toBeInTheDocument();
    });

    it("searches on the server", async () => {
      const user = userEvent.setup();
      served = manyDeleted(7);
      const { onPatch } = renderView();
      await screen.findByText("Showing 3 of 7");

      await user.click(
        screen.getByRole("searchbox", { name: "Search deleted Cases" })
      );
      await user.paste("Case 04");
      await user.tab();
      await waitFor(() => {
        expect(lastRequest()).toMatchObject({ q: "Case 04" });
      });
      expect(onPatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "Case 04" })
      );
      expect(await screen.findByText("Showing 1")).toBeInTheDocument();
    });

    it("filters on the server by Purge started", async () => {
      const user = userEvent.setup();
      served = manyDeleted(7);
      renderView();
      await screen.findByText("Showing 3 of 7");

      await user.click(screen.getByRole("button", { name: /^Filters/ }));
      await user.click(
        await screen.findByRole("button", { name: "Add filter" })
      );
      await user.click(screen.getByRole("switch", { name: /Purge started/ }));
      await waitFor(() => {
        expect(lastRequest()).toMatchObject({ purging: true });
      });
      // Cases 00 and 05 have begun their purge.
      expect(await screen.findByText("Showing 2")).toBeInTheDocument();
    });

    it("sorts on the server from Display options", async () => {
      const user = userEvent.setup();
      served = manyDeleted(7);
      const { onPatch } = renderView();
      await screen.findByText("Showing 3 of 7");

      await user.click(screen.getByRole("button", { name: "Display options" }));
      await user.click(
        await screen.findByRole("radio", { name: /Deleted, Oldest/ })
      );
      expect(onPatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "deleted.asc" })
      );
      await waitFor(() => {
        expect(lastRequest()).toMatchObject({ sort: "deleted.asc" });
      });
      await waitFor(() => {
        expect(rowNames()[0]).toBe("Case 00");
      });
    });

    it("opens the URL's view, and the URL round-trips", async () => {
      served = manyDeleted(7);
      renderView({ q: "Case 0", purging: true, sort: "name.desc" });
      expect(await screen.findByText("Showing 2")).toBeInTheDocument();
      expect(lastRequest()).toEqual({
        q: "Case 0",
        purging: true,
        sort: "name.desc",
      });
      const query = deletedCaseList.queryOf({
        q: "Case 0",
        purging: true,
        sort: "name.desc",
      });
      expect(deletedCaseList.queryOf(deletedCaseList.toSearch(query))).toEqual(
        query
      );
    });

    it("says “No deleted cases yet” for an empty list, “Nothing matches” when a search finds none", async () => {
      served = [];
      const first = renderView();
      expect(
        await screen.findByText("No Deleted Cases Yet")
      ).toBeInTheDocument();
      expect(screen.queryByText(/Nothing Matches/)).not.toBeInTheDocument();
      destroyTestRouter(first.router);
    });

    it("says “Nothing matches these filters” when a search matches nothing", async () => {
      renderView({ q: "zzz-none" });
      expect(
        await screen.findByText("Nothing Matches These Filters")
      ).toBeInTheDocument();
      expect(
        screen.queryByText("No Deleted Cases Yet")
      ).not.toBeInTheDocument();
    });
  });
});

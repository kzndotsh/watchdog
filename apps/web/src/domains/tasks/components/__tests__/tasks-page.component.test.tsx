import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import type {
  TasksSearch,
  TasksSearchPatch,
} from "@/domains/tasks/lib/tasks-search";
import type { TaskListItem } from "@/domains/tasks/types";
import { toast } from "@/shared/ui/toast";
import { buildEntityRecord, buildTaskListItem } from "@/testing/records";
import { taskList } from "@watchdog/schemas/feed";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: ({ count }: { count?: React.ReactNode }) => (
    <div data-testid="header-count">{count}</div>
  ),
}));

vi.mock("@watchdog/ui/components/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

const ACTIVE: CaseRecord = {
  id: testCaseId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

vi.mock("@/domains/cases/hooks/use-live-work-case", () => ({
  useLiveWorkCase: () => ACTIVE,
}));

const fns = vi.hoisted(() => ({
  listTasksPageFn: vi.fn(),
  getTaskBoardFn: vi.fn(),
  getTaskFn: vi.fn(),
}));

vi.mock("@/domains/tasks/tasks.functions", () => ({
  ...fns,
  createTaskFn: vi.fn(),
  updateTaskFn: vi.fn(),
  deleteTaskFn: vi.fn(),
  reorderTasksFn: vi.fn(),
}));

// The Entity filter's reads: by id for the chip, one small page once the popover opens. The
// whole Entity list is a spy the board must never call (cards carry their Entity's label).
const entityReads = vi.hoisted(() => ({
  listEntitiesFn: vi.fn(),
  listEntitiesPickerPageFn: vi.fn(),
  getEntitiesFn: vi.fn(),
}));
vi.mock("@/domains/entities/entities.functions", () => entityReads);

import { TasksPage } from "@/domains/tasks/components/tasks-page";
import { TASK_LINK_GONE } from "@/domains/tasks/hooks/use-task-deep-link";
import { memoryTasks } from "@/testing/memory-tasks";
import { renderIn } from "@/testing/render-in-case";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";

const render = renderIn(ACTIVE);

const ACME = buildEntityRecord({
  id: testId(40),
  name: "Acme Corp",
  slug: "acme-corp",
});
const ACME_LABEL = {
  id: ACME.id,
  name: ACME.name,
  slug: ACME.slug,
  kind: ACME.kind,
};

const minute = (n: number) =>
  new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString();

/** Open cards `Open 0..`, then `count` done ones (`Done 00` oldest), every other on Acme. */
function board(open: number, done: number): TaskListItem[] {
  const openRows = Array.from({ length: open }, (_, n) =>
    buildTaskListItem({
      id: testId(100 + n),
      title: `Open ${String(n)}`,
      status: n % 2 === 0 ? "backlog" : "blocked",
      priority: n === 0 ? "high" : null,
      position: n,
      ...(n % 2 === 0 ? { entity: ACME_LABEL } : {}),
    })
  );
  const doneRows = Array.from({ length: done }, (_, n) =>
    buildTaskListItem({
      id: testId(200 + n),
      title: `Done ${String(n).padStart(2, "0")}`,
      status: "done",
      updatedAt: minute(n),
      ...(n % 2 === 0 ? { entity: ACME_LABEL } : {}),
    })
  );
  return [...openRows, ...doneRows];
}

function Route({
  initial,
  onPatch,
}: {
  initial: TasksSearch;
  onPatch: (patch: TasksSearchPatch) => void;
}) {
  const [search, setSearch] = useState<TasksSearch>(initial);
  return (
    <TasksPage
      search={search}
      onSearchChange={(patch) => {
        onPatch(patch);
        setSearch((prev) =>
          Object.fromEntries(
            Object.entries({ ...prev, ...patch }).filter(
              ([, value]) => value !== undefined
            )
          )
        );
      }}
    />
  );
}

function renderPage(
  rows: readonly TaskListItem[],
  initial: TasksSearch = {},
  options: { pageSize?: number; cap?: number } = {}
) {
  const server = memoryTasks(rows, { pageSize: 3, ...options });
  fns.getTaskBoardFn.mockImplementation(server.board);
  fns.listTasksPageFn.mockImplementation(server.listPage);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  const onPatch = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <Route initial={initial} onPatch={onPatch} />
    </QueryClientProvider>
  );
  return { onPatch };
}

function dataOf(call: unknown): Record<string, unknown> {
  if (typeof call !== "object" || call === null || !("data" in call)) {
    throw new Error("no request");
  }
  const { data } = call;
  if (typeof data !== "object" || data === null) throw new Error("no data");
  return { ...data };
}

const lastBoardRequest = () => dataOf(fns.getTaskBoardFn.mock.lastCall?.[0]);

/** The last request of the Done column (the Task list with `status` fixed to done). */
function lastDoneRequest(): Record<string, unknown> {
  const calls = fns.listTasksPageFn.mock.calls.map(([call]) => dataOf(call));
  const done = calls.filter(
    (data) => Array.isArray(data.status) && data.status.includes("done")
  );
  const last = done.at(-1);
  if (last === undefined) throw new Error("no Done request");
  return last;
}

function column(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: new RegExp(`^${name}`) });
  const shell = heading.closest("header")?.parentElement;
  if (!shell) throw new Error(`no ${name} column`);
  return shell;
}

beforeAll(preloadSharedLazyChunks);

beforeEach(() => {
  for (const fn of [...Object.values(fns), ...Object.values(entityReads)]) {
    fn.mockReset();
  }
  entityReads.getEntitiesFn.mockResolvedValue([ACME]);
  entityReads.listEntitiesPickerPageFn.mockResolvedValue({
    items: [ACME],
    nextCursor: null,
    total: { count: 1, isCapped: false },
  });
  vi.mocked(toast.info).mockClear();
});

describe("TasksPage", () => {
  it("reads the open columns once and the first page of Done and Dropped, never a whole list", async () => {
    renderPage(board(2, 5));

    expect(await screen.findByText("Open 0")).toBeInTheDocument();
    expect(await screen.findByText("Done 04")).toBeInTheDocument();
    expect(fns.getTaskBoardFn).toHaveBeenCalledTimes(1);
    expect(lastBoardRequest()).toEqual({ caseId: ACTIVE.id });
    expect(fns.listTasksPageFn).toHaveBeenCalledTimes(2);
    expect(lastDoneRequest()).toEqual({ caseId: ACTIVE.id, status: ["done"] });
    // Done is newest first (the declared default), a page of 3 with its footer.
    const done = column("Done");
    expect(within(done).getByText("Showing 3 of 5")).toBeInTheDocument();
    expect(within(done).queryByText("Done 01")).not.toBeInTheDocument();
    // Cards carry their Entity's label: no Entity list is read.
    expect(screen.getAllByText("Acme Corp").length).toBeGreaterThan(0);
    expect(entityReads.listEntitiesFn).not.toHaveBeenCalled();
    expect(screen.getByTestId("header-count")).toHaveTextContent("2");
  });

  it("loads more of Done through the column's footer", async () => {
    const user = userEvent.setup();
    renderPage(board(1, 5));
    const done = await waitFor(() => {
      const shell = column("Done");
      expect(within(shell).getByText("Showing 3 of 5")).toBeInTheDocument();
      return shell;
    });

    await user.click(within(done).getByRole("button", { name: "Load more" }));

    expect(await within(done).findByText("Showing 5")).toBeInTheDocument();
    expect(within(done).getByText("Done 00")).toBeInTheDocument();
    expect(lastDoneRequest()).toMatchObject({ cursor: "3" });
    expect(fns.getTaskBoardFn).toHaveBeenCalledTimes(1);
  });

  it("searches every column on the server", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPage(board(3, 12));
    await screen.findByText("Open 0");

    await user.click(screen.getByRole("searchbox", { name: "Search tasks" }));
    await user.paste("Done 1");
    await user.tab();

    await waitFor(() => {
      expect(onPatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "Done 1" })
      );
    });
    await waitFor(() => {
      expect(lastBoardRequest()).toEqual({ caseId: ACTIVE.id, q: "Done 1" });
    });
    expect(lastDoneRequest()).toMatchObject({ q: "Done 1" });
    await waitFor(() => {
      expect(screen.queryByText("Open 0")).not.toBeInTheDocument();
    });
    expect(
      await within(column("Done")).findByText("Showing 2")
    ).toBeInTheDocument();
  });

  it("filters every column by priority from the Filters popover", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPage(board(3, 2));
    await screen.findByText("Open 2");

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(await screen.findByRole("button", { name: "Add filter" }));
    // Status is each column's own: Priority is the first filter offered.
    await user.click(screen.getByRole("combobox", { name: "Priority values" }));
    await user.click(await screen.findByRole("option", { name: "High" }));

    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ priority: ["high"] })
    );
    await waitFor(() => {
      expect(lastBoardRequest()).toEqual({
        caseId: ACTIVE.id,
        priority: ["high"],
      });
    });
    expect(lastDoneRequest()).toMatchObject({ priority: ["high"] });
    await waitFor(() => {
      expect(screen.queryByText("Open 2")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Open 0")).toBeInTheDocument();
  });

  it("sorts the finished columns from Display options; the open columns keep their order", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPage(board(2, 5));
    await screen.findByText("Done 04");

    await user.click(screen.getByRole("button", { name: "Display options" }));
    await user.click(
      await screen.findByRole("radio", { name: /Updated, Oldest/ })
    );

    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "updated.asc" })
    );
    await waitFor(() => {
      expect(lastDoneRequest()).toMatchObject({ sort: "updated.asc" });
    });
    expect(await screen.findByText("Done 00")).toBeInTheDocument();
    expect(fns.getTaskBoardFn).toHaveBeenCalledTimes(1);
  });

  it("opens the URL's view with its Entity chip, and the URL round-trips", async () => {
    const url: TasksSearch = {
      entityId: ACME.id,
      q: "Done",
      sort: "title.desc",
    };
    renderPage(board(2, 5), url);

    expect(await screen.findByText("Done 04")).toBeInTheDocument();
    expect(lastBoardRequest()).toEqual({
      caseId: ACTIVE.id,
      entityId: ACME.id,
      q: "Done",
    });
    expect(lastDoneRequest()).toEqual({
      caseId: ACTIVE.id,
      status: ["done"],
      entityId: ACME.id,
      q: "Done",
      sort: "title.desc",
    });
    const chips = screen.getByRole("group", { name: "Active filters" });
    expect(await within(chips).findByText(/Acme Corp/)).toBeInTheDocument();
    expect(entityReads.getEntitiesFn).toHaveBeenCalledWith({
      data: { caseId: ACTIVE.id, ids: [ACME.id] },
    });

    const query = taskList.queryOf(url);
    expect(taskList.queryOf(taskList.toSearch(query))).toEqual(query);
  });

  it("says “No tasks yet” in an empty Done column, “Nothing matches” only while filtered", async () => {
    renderPage(board(1, 0));
    expect(
      await within(await waitFor(() => column("Done"))).findByText(
        "No Tasks Yet"
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nothing Matches/)).not.toBeInTheDocument();
  });

  it("says “Nothing matches these filters” when the view's search finds nothing", async () => {
    renderPage(board(1, 3), { q: "zzz-none" });
    expect(
      (await screen.findAllByText("Nothing Matches These Filters")).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("No Tasks Yet")).not.toBeInTheDocument();
  });

  it("says so when the board holds the cap of open cards", async () => {
    renderPage(board(4, 0), {}, { cap: 3 });
    expect(
      await screen.findByText(/Showing the first 500 open tasks/)
    ).toBeInTheDocument();
    expect(screen.queryByText("Open 3")).not.toBeInTheDocument();
    // The header says the board was cut: "3+", ListCount's capped form.
    expect(screen.getByTestId("header-count")).toHaveTextContent("3+");
  });

  it("opens a linked card on the board, and drops the link when the dialog closes", async () => {
    const user = userEvent.setup();
    const rows = board(2, 0);
    const { onPatch } = renderPage(rows, { taskId: rows[1]?.id });

    expect(
      await screen.findByRole("dialog", { name: "Edit task" })
    ).toBeInTheDocument();
    expect(fns.getTaskFn).not.toHaveBeenCalled();
    // The link names the open card: it stays while the dialog is open.
    expect(onPatch).not.toHaveBeenCalledWith({ taskId: undefined });

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Edit task" })
      ).not.toBeInTheDocument();
    });
    expect(onPatch).toHaveBeenCalledWith({ taskId: undefined });
  });

  it("reads a linked card the board has not loaded by id", async () => {
    const rows = board(1, 5);
    const older = rows.find((row) => row.title === "Done 00");
    if (older === undefined) throw new Error("fixture");
    fns.getTaskFn.mockResolvedValue(older);
    const { onPatch } = renderPage(rows, { taskId: older.id });

    expect(
      await screen.findByRole("dialog", { name: "Edit task" })
    ).toBeInTheDocument();
    expect(fns.getTaskFn).toHaveBeenCalledWith({
      data: { caseId: ACTIVE.id, taskId: older.id },
    });
    expect(onPatch).not.toHaveBeenCalledWith({ taskId: undefined });
  });

  it("clears a link to a card the Case no longer holds, with a notice", async () => {
    fns.getTaskFn.mockResolvedValue(null);
    const { onPatch } = renderPage(board(1, 0), { taskId: testId(999) });

    await waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith({ taskId: undefined });
    });
    expect(toast.info).toHaveBeenCalledWith(TASK_LINK_GONE);
    expect(
      screen.queryByRole("dialog", { name: "Edit task" })
    ).not.toBeInTheDocument();
  });
});

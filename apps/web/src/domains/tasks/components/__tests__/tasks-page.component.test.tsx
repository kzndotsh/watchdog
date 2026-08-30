import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/shared/layout/page", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageHeader: ({
    actions,
    count,
  }: {
    actions?: React.ReactNode;
    count?: number;
  }) => (
    <div>
      <div>Tasks page header</div>
      {count === undefined ? null : <div>{count} tasks</div>}
      {actions}
    </div>
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/domains/tasks/components/task-board", () => ({
  TaskBoard: () => <div>Task board</div>,
}));

vi.mock("@/domains/tasks/components/task-form-dialog", () => ({
  TaskFormDialog: ({ mode, open }: { mode: string; open: boolean }) =>
    open ? <div>{mode} task dialog</div> : null,
}));

vi.mock("@/shared/ui/skeletons", () => ({
  BoardSkeleton: () => <div>Loading tasks</div>,
}));

const useSuspenseQueryMock = vi.hoisted(() => vi.fn());
const useTaskWorkspaceMock = vi.hoisted(() => vi.fn());
const openCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useSuspenseQuery: (...args: unknown[]) => useSuspenseQueryMock(...args),
  };
});

vi.mock("@/domains/tasks/hooks/use-task-workspace", () => ({
  useTaskWorkspace: (...args: unknown[]) => useTaskWorkspaceMock(...args),
}));

import { TasksPage } from "@/domains/tasks/components/tasks-page";

const ACTIVE: CaseRecord = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

function renderPage(entityId?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <TasksPage entityId={entityId} />
      </Suspense>
    </QueryClientProvider>
  );
}

describe("TasksPage", () => {
  it("prompts for an active case when none is selected", () => {
    useSuspenseQueryMock.mockReturnValue({
      data: { cases: [], active: null },
    });

    renderPage();

    expect(screen.getByText("No Active Case")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Select a Case" })).toHaveAttribute(
      "href",
      "/cases"
    );
  });

  it("renders the task board and new-task action for the active case", () => {
    useSuspenseQueryMock.mockReturnValue({
      data: { cases: [ACTIVE], active: ACTIVE },
    });
    useTaskWorkspaceMock.mockReturnValue({
      tasks: [{ id: testId(20) }],
      entities: [],
      entityById: new Map(),
      selected: null,
      formError: null,
      createOpen: false,
      createStatus: "backlog",
      createBusy: false,
      updateBusy: false,
      quickCreateBusy: false,
      openCreate: openCreateMock,
      handleSelect: vi.fn(),
      closeSelected: vi.fn(),
      handleCreateOpenChange: vi.fn(),
      handleCreate: vi.fn(),
      handleUpdate: vi.fn(),
      handleDelete: vi.fn(),
      handleCommitDrop: vi.fn(),
      handleQuickCreate: vi.fn(),
    });

    renderPage();

    expect(screen.getByText("Tasks page header")).toBeInTheDocument();
    expect(screen.getByText("1 tasks")).toBeInTheDocument();
    expect(screen.getByText("Task board")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    expect(openCreateMock).toHaveBeenCalledWith("backlog");
    expect(useTaskWorkspaceMock).toHaveBeenCalledWith(ACTIVE.id, {
      entityId: undefined,
    });
  });
});

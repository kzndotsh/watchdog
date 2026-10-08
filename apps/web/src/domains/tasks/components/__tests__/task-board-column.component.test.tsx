import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { TaskRecord } from "@/domains/tasks/types";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.getAnimations = vi.fn(() => []);
});

vi.mock("@dnd-kit/core", () => ({
  useDroppable: () => ({ setNodeRef: vi.fn() }),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/domains/tasks/lib/task-board-dnd", () => ({
  frozenSortingStrategy: vi.fn(),
}));

vi.mock("@/domains/tasks/components/task-card", () => ({
  TaskCard: ({
    task,
    onSelect,
  }: {
    task: TaskRecord;
    onSelect: (task: TaskRecord) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onSelect(task);
      }}
    >
      {task.title}
    </button>
  ),
  TaskCardPreview: ({ task }: { task: TaskRecord }) => (
    <div>{task.title} preview</div>
  ),
}));

import { TaskBoardColumn } from "@/domains/tasks/components/task-board-column";

const TASK: TaskRecord = {
  id: testId(20),
  caseId: testCaseId(10),
  entityId: null,
  title: "Follow up lead",
  description: null,
  status: "backlog",
  priority: null,
  dueDate: null,
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("TaskBoardColumn", () => {
  it("renders the column label, count, and task cards", () => {
    const onSelect = vi.fn();

    render(
      <TaskBoardColumn column="backlog" items={[TASK]} onSelect={onSelect} />
    );

    expect(
      screen.getByRole("heading", { name: /Backlog/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Follow up lead")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Follow up lead" }));
    expect(onSelect).toHaveBeenCalledWith(TASK);
  });

  it("creates a task through the inline composer", async () => {
    const onQuickCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <TaskBoardColumn
        column="in_progress"
        items={[]}
        onSelect={vi.fn()}
        onQuickCreate={onQuickCreate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    fireEvent.change(screen.getByLabelText("New In Progress task title"), {
      target: { value: "  Verify alias  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(onQuickCreate).toHaveBeenCalledWith("in_progress", "Verify alias");
    });
  });

  it("shows a drop slot preview while dragging over the column", () => {
    const dragging: TaskRecord = { ...TASK, id: testId(21), title: "Dragging" };

    render(
      <TaskBoardColumn
        column="backlog"
        items={[TASK]}
        onSelect={vi.fn()}
        isDropTarget
        activeItem={dragging}
        dropSlotIndex={0}
      />
    );

    expect(screen.getByText("Dragging preview")).toBeInTheDocument();
    expect(screen.getByText("Follow up lead")).toBeInTheDocument();
  });
});

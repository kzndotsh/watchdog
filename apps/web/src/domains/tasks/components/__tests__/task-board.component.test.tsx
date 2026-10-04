import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { TaskRecord } from "@/domains/tasks/types";
import { TASK_STATUSES } from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dnd-context">{children}</div>
  ),
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
  PointerSensor: class PointerSensor {},
  KeyboardSensor: class KeyboardSensor {},
  useSensor: vi.fn(),
  useSensors: () => [],
  closestCorners: vi.fn(() => []),
  pointerWithin: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  sortableKeyboardCoordinates: vi.fn(),
}));

vi.mock("@/domains/tasks/hooks/use-live-region", () => ({
  useLiveRegion: () => ({
    announce: vi.fn(),
    liveRegion: <div data-testid="live-region" />,
  }),
}));

vi.mock("@/domains/tasks/components/task-board-column", () => ({
  TaskBoardColumn: ({
    column,
    items,
    onSelect,
    onQuickCreate,
  }: {
    column: string;
    items: TaskRecord[];
    onSelect: (task: TaskRecord) => void;
    onQuickCreate?: (status: TaskRecord["status"], title: string) => void;
  }) => (
    <div data-testid={`column-${column}`}>
      <span>
        {column} ({items.length})
      </span>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            onSelect(item);
          }}
        >
          {item.title}
        </button>
      ))}
      {onQuickCreate ? (
        <button
          type="button"
          onClick={() => {
            onQuickCreate(column as TaskRecord["status"], "Quick");
          }}
        >
          Quick add
        </button>
      ) : null}
    </div>
  ),
}));

import { TaskBoard } from "@/domains/tasks/components/task-board";

const CASE_ID = testId(10);

function task(
  id: string,
  status: TaskRecord["status"],
  title: string
): TaskRecord {
  return {
    id,
    caseId: CASE_ID,
    entityId: null,
    title,
    description: null,
    status,
    priority: null,
    dueDate: null,
    position: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("TaskBoard", () => {
  it("renders a column for every task status with grouped items", () => {
    const items = [
      task(testId(20), "backlog", "Backlog task"),
      task(testId(21), "in_progress", "Active task"),
    ];

    render(
      <TaskBoard items={items} onSelect={vi.fn()} onCommitDrop={vi.fn()} />
    );

    expect(screen.getByTestId("dnd-context")).toBeInTheDocument();
    expect(screen.getByTestId("live-region")).toBeInTheDocument();

    for (const status of TASK_STATUSES) {
      expect(screen.getByTestId(`column-${status}`)).toBeInTheDocument();
    }

    expect(screen.getByText("backlog (1)")).toBeInTheDocument();
    expect(screen.getByText("in_progress (1)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Backlog task" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Active task" })
    ).toBeInTheDocument();
  });

  it("forwards selection and quick-create callbacks to columns", () => {
    const onSelect = vi.fn();
    const onQuickCreate = vi.fn();
    const items = [task(testId(20), "backlog", "Backlog task")];

    render(
      <TaskBoard
        items={items}
        onSelect={onSelect}
        onCommitDrop={vi.fn()}
        onQuickCreate={onQuickCreate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Backlog task" }));
    expect(onSelect).toHaveBeenCalledWith(items[0]);

    fireEvent.click(
      within(screen.getByTestId("column-backlog")).getByRole("button", {
        name: "Quick add",
      })
    );
    expect(onQuickCreate).toHaveBeenCalledWith("backlog", "Quick");
  });
});

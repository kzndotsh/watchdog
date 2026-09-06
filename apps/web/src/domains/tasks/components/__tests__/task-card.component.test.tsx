import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TaskEntityLabel, TaskRecord } from "@/domains/tasks/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => {},
    },
  },
}));

import {
  TaskCard,
  TaskCardPreview,
} from "@/domains/tasks/components/task-card";

const TASK: TaskRecord = {
  id: testId(20),
  caseId: testId(10),
  entityId: testId(30),
  title: "Verify alias",
  description: null,
  status: "in_progress",
  priority: "high",
  dueDate: "2026-02-01T00:00:00.000Z",
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ENTITY: TaskEntityLabel = {
  id: testId(30),
  name: "Target Alpha",
  kind: "person",
};

describe("TaskCard", () => {
  it("renders task details and selects on click", () => {
    const onSelect = vi.fn();
    const entityById = new Map([[ENTITY.id, ENTITY]]);

    render(
      <TaskCard task={TASK} onSelect={onSelect} entityById={entityById} />
    );

    expect(screen.getByText("Verify alias")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Target Alpha")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Verify alias/i }));
    expect(onSelect).toHaveBeenCalledWith(TASK);
  });

  it("exposes Delete in the card actions menu", async () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    render(<TaskCard task={TASK} onSelect={onSelect} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "Task actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(TASK);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("strikes through done tasks", () => {
    render(<TaskCard task={{ ...TASK, status: "done" }} onSelect={vi.fn()} />);

    expect(screen.getByText("Verify alias")).toHaveClass("line-through");
  });
});

describe("TaskCardPreview", () => {
  it("renders the drag preview body", () => {
    const entityById = new Map([[ENTITY.id, ENTITY]]);

    render(<TaskCardPreview task={TASK} entityById={entityById} />);

    expect(screen.getByText("Verify alias")).toBeInTheDocument();
    expect(screen.getByText("Target Alpha")).toBeInTheDocument();
  });
});

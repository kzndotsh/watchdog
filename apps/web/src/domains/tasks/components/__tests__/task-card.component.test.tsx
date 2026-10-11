import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { TaskEntityLabel, TaskRecord } from "@/domains/tasks/types";
import { testCaseId } from "@watchdog/schemas/testing";
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
  caseId: testCaseId(10),
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
  slug: "target-alpha",
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

  it("is a real button named by the task title (no role=button div)", () => {
    const { container } = render(<TaskCard task={TASK} onSelect={vi.fn()} />);

    const card = screen.getByRole("button", { name: "Verify alias" });
    expect(card.tagName).toBe("BUTTON");
    expect(container.querySelector('div[role="button"]')).toBeNull();
  });

  it.each([
    ["Enter", "{Enter}"],
    ["Space", " "],
  ])(
    "activates on %s as a native button (card alone, dnd-kit mocked; the board's real sensors are in task-board-keyboard.component.test.tsx)",
    async (_label, keys) => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<TaskCard task={TASK} onSelect={onSelect} onDelete={vi.fn()} />);

      await user.tab();
      expect(
        screen.getByRole("button", { name: "Verify alias" })
      ).toHaveFocus();
      await user.keyboard(keys);
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(TASK);
    }
  );

  it("keeps the actions menu a separate button, not nested in the card button", () => {
    render(<TaskCard task={TASK} onSelect={vi.fn()} onDelete={vi.fn()} />);

    const card = screen.getByRole("button", { name: "Verify alias" });
    const menu = screen.getByRole("button", { name: "Task actions" });
    expect(card.contains(menu)).toBe(false);
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

  it("falls back to entity slug when the entity name is blank", () => {
    const entityById = new Map([
      [ENTITY.id, { ...ENTITY, name: "  ", slug: "unnamed-target" }],
    ]);

    render(<TaskCard task={TASK} onSelect={vi.fn()} entityById={entityById} />);

    expect(screen.getByText("unnamed-target")).toBeInTheDocument();
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

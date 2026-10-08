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

vi.mock("@/shared/ui/entity-combobox", () => ({
  EntityCombobox: ({
    entities,
    value,
    onValueChange,
    "aria-label": ariaLabel,
  }: {
    entities: { id: string; name: string }[];
    value: string;
    onValueChange: (id: string) => void;
    "aria-label"?: string;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => {
        onValueChange(event.target.value);
      }}
    >
      <option value="">No entity</option>
      {entities.map((entity) => (
        <option key={entity.id} value={entity.id}>
          {entity.name}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@/shared/ui/field-select", () => ({
  FieldSelect: ({
    value,
    options,
    onValueChange,
    "aria-label": ariaLabel,
  }: {
    value: string;
    options: { value: string; label: string }[];
    onValueChange: (value: string) => void;
    "aria-label"?: string;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => {
        onValueChange(event.target.value);
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

import { TaskFormDialog } from "@/domains/tasks/components/task-form-dialog";

const ENTITIES = [
  { id: testId(30), name: "Target Alpha", kind: "person" as const },
];

const TASK: TaskRecord = {
  id: testId(20),
  caseId: testCaseId(10),
  entityId: testId(30),
  title: "Verify alias",
  description: "Check registration",
  status: "in_progress",
  priority: "high",
  dueDate: "2026-02-01T00:00:00.000Z",
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("TaskFormDialog", () => {
  it("creates a task from the new-task dialog", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <TaskFormDialog
        mode="create"
        open
        onOpenChange={vi.fn()}
        entities={ENTITIES}
        onSubmit={onSubmit}
      />
    );

    expect(
      screen.getByRole("heading", { name: "New task" })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "New follow up" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "New follow up",
          status: "backlog",
        })
      );
    });
  });

  it("edits an existing task and supports delete", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <TaskFormDialog
        mode="edit"
        open
        onOpenChange={vi.fn()}
        entities={ENTITIES}
        task={TASK}
        onSubmit={onSubmit}
        onDelete={onDelete}
        error="Save failed"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Edit task" })
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Verify alias")).toBeInTheDocument();
    expect(screen.getByText("Save failed")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Updated title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Updated title" })
      );
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });
});

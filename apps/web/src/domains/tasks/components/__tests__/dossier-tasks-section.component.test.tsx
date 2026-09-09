import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TaskRecord } from "@/domains/tasks/types";
import { testId } from "@watchdog/test-kit";

const useTaskWorkspaceMock = vi.hoisted(() => vi.fn());

vi.mock("@/domains/tasks/hooks/use-task-workspace", () => ({
  useTaskWorkspace: (...args: unknown[]) => useTaskWorkspaceMock(...args),
}));

vi.mock("@/domains/tasks/components/task-board", () => ({
  TaskBoard: ({ items }: { items: TaskRecord[] }) => (
    <div>Task board ({items.length})</div>
  ),
}));

vi.mock("@/domains/tasks/components/task-form-dialog", () => ({
  TaskFormDialog: ({ open }: { open: boolean }) =>
    open ? <div>Task form open</div> : null,
}));

import { DossierTasksSection } from "@/domains/tasks/components/dossier-tasks-section";

const CASE_ID = testId(10);
const ENTITY_ID = testId(11);

const TASK: TaskRecord = {
  id: testId(20),
  caseId: CASE_ID,
  entityId: ENTITY_ID,
  title: "Verify alias",
  description: null,
  status: "in_progress",
  priority: null,
  dueDate: null,
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("DossierTasksSection", () => {
  it("scopes the workspace to the dossier entity and renders the board", () => {
    useTaskWorkspaceMock.mockReturnValue({
      tasks: [TASK],
      entities: [],
      entityById: new Map(),
      selected: null,
      formError: null,
      quickCreateError: null,
      updateBusy: false,
      quickCreateBusy: false,
      handleSelect: vi.fn(),
      closeSelected: vi.fn(),
      handleUpdate: vi.fn(),
      handleDelete: vi.fn(),
      handleCommitDrop: vi.fn(),
      handleQuickCreate: vi.fn(),
    });

    render(
      <DossierTasksSection
        caseId={CASE_ID}
        entityId={ENTITY_ID}
        entitySlug="target-alpha"
      />
    );

    expect(screen.getByText("Task board (1)")).toBeInTheDocument();
    expect(useTaskWorkspaceMock).toHaveBeenCalledWith(CASE_ID, {
      entityId: ENTITY_ID,
      live: false,
    });
    expect(screen.queryByText("Task form open")).not.toBeInTheDocument();
  });
});

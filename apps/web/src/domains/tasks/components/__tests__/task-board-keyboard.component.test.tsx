import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { TaskBoard } from "@/domains/tasks/components/task-board";
import type { TaskRecord } from "@/domains/tasks/types";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

// The real DndContext, sensors and sortable wiring: only the browser APIs jsdom lacks.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const TASK: TaskRecord = {
  id: testId(20),
  caseId: testCaseId(10),
  entityId: null,
  title: "Verify alias",
  description: null,
  status: "in_progress",
  priority: null,
  dueDate: null,
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function setup() {
  const onSelect = vi.fn();
  render(
    <TaskBoard
      items={[TASK]}
      onSelect={onSelect}
      onDelete={vi.fn()}
      onCommitDrop={vi.fn()}
    />
  );
  return { onSelect };
}

describe("TaskBoard keyboard (real dnd-kit sensors)", () => {
  it("Enter on a focused card selects it and does not lift it", async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();

    const card = screen.getByRole("button", { name: "Verify alias" });
    card.focus();
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(TASK);
    expect(screen.getAllByText("Verify alias")).toHaveLength(1);
  });

  it("Space lifts the card for a keyboard drag instead of selecting it", async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();

    const card = screen.getByRole("button", { name: "Verify alias" });
    card.focus();
    await user.keyboard(" ");

    // A lifted card also renders as the drag overlay preview.
    try {
      await waitFor(() => {
        expect(screen.getAllByText("Verify alias")).toHaveLength(2);
      });
      expect(onSelect).not.toHaveBeenCalled();
    } finally {
      // Isolation leak (#224): this lift leaves dnd-kit's KeyboardSensor holding
      // document-level keydown listeners that swallow the next Space/Enter
      // (preventDefault + end drag). Unmounting does not remove them, and the
      // component project shares workers (`isolate: false`), so a later file that
      // types a space (UrlForm, PasteForm) or presses Enter on a card (TaskCard)
      // lost that one key, depending on shuffled file order. Cancel the drag here.
      await user.keyboard("{Escape}");
    }
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildTaskListItem } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const fns = vi.hoisted(() => ({
  listTasksPageFn: vi.fn(),
  getTaskBoardFn: vi.fn(),
}));

vi.mock("@/domains/tasks/tasks.functions", () => ({
  listTasksPageFn: fns.listTasksPageFn,
  getTaskBoardFn: fns.getTaskBoardFn,
  getTaskFn: vi.fn(),
  createTaskFn: vi.fn(),
  updateTaskFn: vi.fn(),
  deleteTaskFn: vi.fn(),
  reorderTasksFn: vi.fn(),
}));

import { DossierTasksSection } from "@/domains/tasks/components/dossier-tasks-section";
import { memoryTasks } from "@/testing/memory-tasks";

const CASE_ID = testCaseId(10);
const ENTITY_ID = testId(11);
const ENTITY = {
  id: ENTITY_ID,
  name: "Target Alpha",
  slug: "target-alpha",
  kind: "person" as const,
};

const OPEN = buildTaskListItem({
  id: testId(20),
  title: "Verify alias",
  status: "in_progress",
  entity: ENTITY,
});
const DONE = buildTaskListItem({
  id: testId(21),
  title: "Closed lead",
  status: "done",
  entity: ENTITY,
});
const ELSEWHERE = buildTaskListItem({ id: testId(22), title: "Not ours" });

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DossierTasksSection caseId={CASE_ID} entityId={ENTITY_ID} />
    </QueryClientProvider>
  );
}

describe("DossierTasksSection", () => {
  beforeEach(() => {
    const server = memoryTasks([OPEN, DONE, ELSEWHERE]);
    fns.getTaskBoardFn.mockReset().mockImplementation(server.board);
    fns.listTasksPageFn.mockReset().mockImplementation(server.listPage);
  });

  it("is the Case's board with the Entity fixed: no Case-wide Task or Entity read", async () => {
    renderSection();

    expect(await screen.findByText("Verify alias")).toBeInTheDocument();
    expect(await screen.findByText("Closed lead")).toBeInTheDocument();
    expect(screen.queryByText("Not ours")).not.toBeInTheDocument();
    // Each card carries its Entity's label from the server.
    expect(screen.getAllByText("Target Alpha").length).toBeGreaterThan(0);
    expect(fns.getTaskBoardFn.mock.calls).toEqual([
      [{ data: { caseId: CASE_ID, entityId: ENTITY_ID } }],
    ]);
    expect(fns.listTasksPageFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, status: ["done"], entityId: ENTITY_ID },
    });
    expect(fns.listTasksPageFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, status: ["dropped"], entityId: ENTITY_ID },
    });
    // The fixed Entity is no filter: an empty column is blank, not "Nothing matches".
    expect(await screen.findByText("No Tasks Yet")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing Matches/)).not.toBeInTheDocument();
  });
});

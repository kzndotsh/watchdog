import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TaskStatusBadge } from "@/shared/ui/vocab/task-status";
import {
  taskStatusLabel,
  TASK_STATUS_TONE_MAP,
} from "@/shared/ui/vocab/task-status.lib";

describe("task-status vocab", () => {
  it("maps task statuses to labels and status tones", () => {
    expect(taskStatusLabel("in_progress")).toBe("In Progress");
    expect(TASK_STATUS_TONE_MAP.done).toBe("succeeded");
    expect(TASK_STATUS_TONE_MAP.blocked).toBe("blocked");
  });

  it("renders task status badge copy", () => {
    render(<TaskStatusBadge status="blocked" />);
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TaskPriorityBadge } from "@/shared/ui/vocab/task-priority";
import {
  taskPriorityLabel,
  TASK_PRIORITY_TONE_MAP,
} from "@/shared/ui/vocab/task-priority.lib";

describe("task-priority vocab", () => {
  it("maps priorities to labels and status tones", () => {
    expect(taskPriorityLabel("high")).toBe("High");
    expect(TASK_PRIORITY_TONE_MAP.high).toBe("pending");
  });

  it("renders priority badge copy", () => {
    render(<TaskPriorityBadge priority="high" />);
    expect(screen.getByText("High")).toBeInTheDocument();
  });
});

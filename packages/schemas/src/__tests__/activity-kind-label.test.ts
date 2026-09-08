import { describe, expect, it } from "vitest";

import { activityKindLabel } from "../activity";

describe("activityKindLabel", () => {
  it("maps activity feed kinds to display labels", () => {
    expect(activityKindLabel("evidence")).toBe("Evidence");
    expect(activityKindLabel("job")).toBe("Job");
    expect(activityKindLabel("proposal")).toBe("Proposal");
    expect(activityKindLabel("task")).toBe("Task");
  });
});

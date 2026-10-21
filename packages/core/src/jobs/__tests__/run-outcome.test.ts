import { describe, expect, it } from "vitest";

import { outcomeFromStopStatus } from "../run-outcome";

describe("outcomeFromStopStatus", () => {
  it("reports a terminal Job as its own status", () => {
    expect(outcomeFromStopStatus("succeeded")).toBe("succeeded");
    expect(outcomeFromStopStatus("failed")).toBe("failed");
    expect(outcomeFromStopStatus("cancelled")).toBe("cancelled");
  });

  it("calls a Job that is still open, or missing, stopped", () => {
    expect(outcomeFromStopStatus("queued")).toBe("stopped");
    expect(outcomeFromStopStatus("running")).toBe("stopped");
    expect(outcomeFromStopStatus(undefined)).toBe("stopped");
  });
});

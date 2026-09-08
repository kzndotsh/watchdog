import { describe, expect, it } from "vitest";

import {
  pickPlaybookAggregateStatus,
  PLAYBOOK_AGGREGATE_STATUS_PRIORITY,
} from "../vocab";

describe("pickPlaybookAggregateStatus", () => {
  it("prefers blocked over queued", () => {
    expect(pickPlaybookAggregateStatus(["queued", "blocked"])).toBe("blocked");
  });

  it("prefers running over blocked", () => {
    expect(pickPlaybookAggregateStatus(["blocked", "running"])).toBe("running");
  });

  it("lists open statuses before terminal ones", () => {
    expect(PLAYBOOK_AGGREGATE_STATUS_PRIORITY.indexOf("blocked")).toBeLessThan(
      PLAYBOOK_AGGREGATE_STATUS_PRIORITY.indexOf("failed")
    );
  });
});

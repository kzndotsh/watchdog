import { describe, expect, it } from "vitest";

import {
  pickPlaybookAggregateStatus,
  PLAYBOOK_AGGREGATE_STATUS_PRIORITY,
} from "../vocab";

describe("pickPlaybookAggregateStatus", () => {
  it("prefers running over queued", () => {
    expect(pickPlaybookAggregateStatus(["queued", "running"])).toBe("running");
  });

  it("prefers queued over failed", () => {
    expect(pickPlaybookAggregateStatus(["failed", "queued"])).toBe("queued");
  });

  it("lists open statuses before terminal ones", () => {
    expect(PLAYBOOK_AGGREGATE_STATUS_PRIORITY.indexOf("queued")).toBeLessThan(
      PLAYBOOK_AGGREGATE_STATUS_PRIORITY.indexOf("failed")
    );
  });
});

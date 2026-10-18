import { describe, expect, it } from "vitest";

import { deletedByLabel, restoreWindowLabel } from "../deleted-case-copy";

describe("deleted Case copy", () => {
  it("names who deleted the Case, or says it is unknown", () => {
    expect(deletedByLabel({ deletedByName: "Ada Owner" })).toBe("Ada Owner");
    expect(deletedByLabel({ deletedByName: null })).toBe("an unknown user");
  });

  it("says how long is left to restore, in days", () => {
    expect(restoreWindowLabel({ daysLeft: 30, purging: false })).toBe(
      "30 days left to restore"
    );
    expect(restoreWindowLabel({ daysLeft: 1, purging: false })).toBe(
      "1 day left to restore"
    );
    expect(restoreWindowLabel({ daysLeft: 0, purging: false })).toBe(
      "Restore window ended"
    );
  });

  it("says a purge is in progress, whatever time is left", () => {
    expect(restoreWindowLabel({ daysLeft: 12, purging: true })).toBe(
      "Purge in progress"
    );
  });
});

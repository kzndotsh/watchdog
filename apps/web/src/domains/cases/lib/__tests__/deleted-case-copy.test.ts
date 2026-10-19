import { describe, expect, it } from "vitest";

import {
  daysLabel,
  deletedByLabel,
  restoreBlockedReason,
  restoreWindowLabel,
} from "../deleted-case-copy";

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

  it("pluralises days in one place", () => {
    expect(daysLabel(1)).toBe("1 day");
    expect(daysLabel(7)).toBe("7 days");
  });

  it("explains why Restore is off: a begun purge or an ended window, otherwise nothing", () => {
    expect(restoreBlockedReason({ daysLeft: 5, purging: false })).toBeNull();
    expect(restoreBlockedReason({ daysLeft: 5, purging: true })).toMatch(
      /purge has begun/
    );
    expect(restoreBlockedReason({ daysLeft: 0, purging: false })).toMatch(
      /restore window has ended/
    );
  });

  it("says a purge is in progress, whatever time is left", () => {
    expect(restoreWindowLabel({ daysLeft: 12, purging: true })).toBe(
      "Purge in progress"
    );
  });
});

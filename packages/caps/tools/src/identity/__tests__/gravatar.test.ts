import { describe, expect, it } from "vitest";

import { parseGravatarBody } from "../gravatar";

describe("gravatar", () => {
  it("parseGravatarBody treats empty entries as not found", () => {
    const snap = parseGravatarBody(
      "ada@mailhost.test",
      "abc123",
      "2026-01-01T00:00:00.000Z",
      { entry: [{}] }
    );
    expect(snap.found).toBe(false);
    expect(snap.displayName).toBeNull();
  });

  it("parseGravatarBody keeps substantive profiles as found", () => {
    const snap = parseGravatarBody(
      "ada@mailhost.test",
      "abc123",
      "2026-01-01T00:00:00.000Z",
      {
        entry: [
          {
            displayName: "Ada",
            emails: [{ value: "ada@mailhost.test" }],
          },
        ],
      }
    );
    expect(snap.found).toBe(true);
    expect(snap.displayName).toBe("Ada");
  });
});

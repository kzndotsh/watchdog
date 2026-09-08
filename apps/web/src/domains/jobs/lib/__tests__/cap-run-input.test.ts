import { describe, expect, it } from "vitest";

import { formatCapIo } from "../cap-run-input";

describe("formatCapIo", () => {
  it("labels consume and produce kinds for cap hover cards", () => {
    expect(
      formatCapIo([
        { kind: "ip" },
        { kind: "identifier", type: "email" },
        { kind: "evidence", evidenceKind: "file" },
      ])
    ).toBe("IP, Email, File");
  });
});

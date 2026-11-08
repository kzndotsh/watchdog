import { describe, expect, it } from "vitest";

import {
  cleanPasteCell,
  inferPasteIdentity,
} from "@/domains/entities/lib/infer-paste-identity";

describe("infer-paste-identity", () => {
  it("strips wrapping quotes from pasted cells", () => {
    expect(cleanPasteCell('"alpha@example.com"')).toBe("alpha@example.com");
  });

  it("infers email and handle identities", () => {
    expect(inferPasteIdentity("alpha@example.com")).toEqual({
      type: "email",
      value: "alpha@example.com",
      platform: null,
    });
    expect(inferPasteIdentity("@analyst")).toEqual({
      type: "handle",
      value: "analyst",
      platform: null,
    });
  });

  // Inputs the old paste-inference and Cap-match IP checks classified differently
  // (or that the table's IP recogniser now classifies otherwise); the table wins.
  it.each([
    ["::1", "ip"],
    ["1::", "ip"],
    ["::ffff:1.2.3.4", "ip"],
    ["dead:beef", null],
    ["1:2", null],
    ["aa:bb", null],
    ["1:2:3", null],
    ["12:34:56", null],
    ["001.2.3.4", null],
    ["1.2.3.04", null],
    ["256.1.1.1", null],
    ["fe80::1%eth0", null],
    ["1.2.3.4:80", null],
  ] as const)("types %s as %s", (raw, type) => {
    expect(inferPasteIdentity(raw).type).toBe(type);
  });
});

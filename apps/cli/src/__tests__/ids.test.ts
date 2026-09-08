import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  parseIdList,
  parsePatchIdList,
  requireCaseId,
  requireUuid,
} from "../ids";
import { CliExitError } from "../io";

describe("ids helpers", () => {
  it("requireCaseId trims and validates case UUIDs", () => {
    const id = testId(1);
    expect(requireCaseId(`  ${id}  `)).toBe(id);
  });

  it("requireUuid rejects blank positional IDs", () => {
    expect(() => requireUuid("   ", "Job ID")).toThrow(CliExitError);
  });

  it("parseIdList validates comma-separated UUIDs", () => {
    const a = testId(1);
    const b = testId(2);
    expect(parseIdList(` ${a}, ${b} `)).toEqual([a, b]);
    expect(parseIdList("00000000-0000-4000-8000-000000000088")).toEqual([
      "00000000-0000-4000-8000-000000000088",
    ]);
    expect(() => parseIdList("not-a-uuid")).toThrow(CliExitError);
  });

  it("parseIdList treats blank as omitted for creates", () => {
    expect(parseIdList("")).toBeUndefined();
    expect(parseIdList("   ")).toBeUndefined();
  });

  it("parsePatchIdList clears evidence when blank", () => {
    const id = testId(3);
    expect(parsePatchIdList(undefined)).toBeUndefined();
    expect(parsePatchIdList("")).toEqual([]);
    expect(parsePatchIdList("   ")).toEqual([]);
    expect(parsePatchIdList(id)).toEqual([id]);
  });
});

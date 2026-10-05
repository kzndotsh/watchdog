import { describe, expect, it } from "vitest";

import type { CaseId } from "@watchdog/schemas/shared";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

import {
  parseIdList,
  parsePatchIdList,
  requireCaseId,
  requireUuid,
  resolveEntityId,
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

  it("requireCaseId fails with a USAGE error on a non-UUID case id", () => {
    expect(() => requireCaseId("not-a-uuid")).toThrow(CliExitError);
    expect(() => requireCaseId("   ")).toThrow(CliExitError);
  });

  it("requireCaseId yields a CaseId; a plain string is not one (ADR-0003)", () => {
    const parsed: CaseId = requireCaseId(testCaseId(1));
    const plain = testId(1);
    // @ts-expect-error a plain string is not a CaseId: parse it with requireCaseId first
    const unparsed = () => resolveEntityId(plain, "alpha");
    const ok = () => resolveEntityId(parsed, "alpha");
    expect([typeof ok, typeof unparsed]).toEqual(["function", "function"]);
  });
});

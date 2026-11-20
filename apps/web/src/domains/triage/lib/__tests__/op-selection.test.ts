import { describe, expect, it } from "vitest";

import {
  acceptOpIds,
  setOpsTicked,
  tickedPatch,
  toggleOpSkip,
} from "@/domains/triage/lib/op-selection";
import {
  buildEntityCreateOp,
  buildIdentifierCreateOp,
} from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const entity = buildEntityCreateOp("Acme", "acme", "org", { id: testId(1) });
const a = buildIdentifierCreateOp(testId(1), "domain", "a.example", {
  id: testId(2),
});
const b = buildIdentifierCreateOp(testId(9), "domain", "b.example", {
  id: testId(3),
});
const patch = [entity, a, b];

describe("op selection", () => {
  it("unticks an op with what needs it, in patch order", () => {
    expect(toggleOpSkip(patch, [], testId(1))).toEqual([testId(1), testId(2)]);
    expect(toggleOpSkip(patch, [], testId(3))).toEqual([testId(3)]);
  });

  it("ticks an op back with what it needs", () => {
    expect(toggleOpSkip(patch, [testId(1), testId(2)], testId(2))).toEqual([]);
  });

  it("ticks and unticks a group", () => {
    expect(setOpsTicked(patch, [], [testId(1), testId(3)], false)).toEqual([
      testId(1),
      testId(2),
      testId(3),
    ]);
    expect(
      setOpsTicked(patch, [testId(1), testId(2), testId(3)], [testId(2)], true)
    ).toEqual([testId(3)]);
  });

  it("sends no op ids when every op is ticked", () => {
    expect(acceptOpIds(patch, [])).toBeUndefined();
    expect(acceptOpIds(patch, [testId(3)])).toEqual([testId(1), testId(2)]);
    expect(tickedPatch(patch, [testId(3)])).toEqual([entity, a]);
  });
});

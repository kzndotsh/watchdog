import { expect } from "vitest";

import type { PatchOp } from "@watchdog/schemas/graph";

import type { CapInterpretResult } from "../sdk";

function expectPatchCreates(
  patch: PatchOp[],
  resource: PatchOp["resource"],
  dataMatch: Record<string, unknown>
): PatchOp {
  const hit = patch.find((op) => {
    if (op.resource !== resource) return false;
    return Object.entries(dataMatch).every(([key, value]) =>
      Object.is(op.data[key], value)
    );
  });
  expect(
    hit,
    `expected ${resource} op matching ${JSON.stringify(dataMatch)}`
  ).toBeDefined();
  if (hit === undefined) {
    throw new TypeError("expected a matching create op");
  }
  expect(hit.op).toBe("create");
  return hit;
}

export function expectProposesIdentifier(
  result: CapInterpretResult,
  match: { type: string; value: string }
): PatchOp {
  return expectPatchCreates(result.patch, "identifier", match);
}

export function expectProposesClaim(
  result: CapInterpretResult,
  opts: { textMatches: RegExp | string; class?: string }
): PatchOp {
  const claims = result.patch.filter((op) => op.resource === "claim");
  expect(claims.length).toBeGreaterThan(0);
  const hit = claims.find((op) => {
    const text = op.data.text;
    if (typeof text !== "string") return false;
    if (typeof opts.textMatches === "string") {
      return text.includes(opts.textMatches);
    }
    return opts.textMatches.test(text);
  });
  expect(hit, "expected a claim whose text matches").toBeDefined();
  if (hit === undefined) {
    throw new TypeError("expected a matching claim");
  }
  if (opts.class !== undefined) {
    expect(hit.data.class).toBe(opts.class);
  }
  return hit;
}

export function claimText(result: CapInterpretResult, index = 0): string {
  const text = result.patch[index]?.data.text;
  expect(typeof text).toBe("string");
  if (typeof text !== "string") {
    throw new TypeError("expected claim text");
  }
  return text;
}

/** Caps propose; humans Accept. Interpret must never smuggle a confidence tier. */
export function expectNoConfidenceOnPatch(result: CapInterpretResult): void {
  for (const op of result.patch) {
    expect(op).not.toHaveProperty("confidence");
    expect(op.data).not.toHaveProperty("confidence");
  }
}

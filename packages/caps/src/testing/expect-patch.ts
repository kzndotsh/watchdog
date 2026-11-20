import { expect } from "vitest";

import {
  isPatchOpOf,
  type PatchOp,
  type PatchOpOf,
  type PatchResource,
} from "@watchdog/schemas/graph";

import type { CapInterpretResult } from "../sdk";

/** An op's data read by field name, for assertions across kinds (`{}` when there is no op). */
export function dataOf(
  op: PatchOp | undefined
): Readonly<Record<string, unknown>> {
  return op?.data ?? {};
}

function expectPatchCreates<R extends PatchResource>(
  patch: PatchOp[],
  resource: R,
  dataMatch: Record<string, unknown>
): PatchOpOf<R> {
  const hit = patch.find(
    (op): op is PatchOpOf<R> =>
      isPatchOpOf(op, resource) &&
      Object.entries(dataMatch).every(([key, value]) =>
        Object.is(dataOf(op)[key], value)
      )
  );
  expect(
    hit,
    `expected ${resource} op matching ${JSON.stringify(dataMatch)}`
  ).toBeDefined();
  if (hit === undefined) {
    throw new TypeError("expected a matching create op");
  }
  expect(hit.kind).toBe(`${resource}.create`);
  return hit;
}

export function expectProposesIdentifier(
  result: CapInterpretResult,
  match: { type: string; value: string }
): PatchOpOf<"identifier"> {
  return expectPatchCreates(result.patch, "identifier", match);
}

export function expectProposesClaim(
  result: CapInterpretResult,
  opts: { textMatches: RegExp | string; class?: string }
): PatchOpOf<"claim"> {
  const claims = result.patch.filter((op) => isPatchOpOf(op, "claim"));
  expect(claims.length).toBeGreaterThan(0);
  const hit = claims.find((op) => {
    const { text } = op.data;
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
  const text = dataOf(result.patch[index]).text;
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

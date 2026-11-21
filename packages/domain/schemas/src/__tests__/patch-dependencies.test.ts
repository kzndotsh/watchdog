import { describe, expect, it } from "vitest";

import { testId } from "#test-kit";

import {
  patchOpDependencies,
  patchOpDependents,
  withPatchDependencies,
} from "../patch-dependencies";
import {
  buildEdgeCreateOp,
  buildEntityCreateOp,
  buildIdentifierCreateOp,
} from "../testing";

const entity = buildEntityCreateOp("Acme", "acme", "org", { id: testId(1) });
const other = buildEntityCreateOp("Bo", "bo", "person", { id: testId(2) });
const onAcme = buildIdentifierCreateOp(testId(1), "domain", "acme.example", {
  id: testId(3),
});
const edge = buildEdgeCreateOp(testId(1), testId(2), "employee_of", {
  id: testId(4),
});
const onElsewhere = buildIdentifierCreateOp(testId(9), "domain", "x.example", {
  id: testId(5),
});
const patch = [entity, other, onAcme, edge, onElsewhere];

describe("patch dependencies", () => {
  it("names the ops of the same patch an op's data points at", () => {
    const deps = patchOpDependencies(patch);
    expect(deps.get(testId(3))).toEqual([testId(1)]);
    expect([...(deps.get(testId(4)) ?? [])].sort()).toEqual(
      [testId(1), testId(2)].sort()
    );
    expect(deps.get(testId(5))).toEqual([]);
    expect(deps.get(testId(1))).toEqual([]);
  });

  it("joins what two ops sharing an id need", () => {
    const sameIdElsewhere = { ...onElsewhere, id: testId(3) };
    const shared = [entity, onAcme, sameIdElsewhere];
    expect(patchOpDependencies(shared).get(testId(3))).toEqual([testId(1)]);
    expect(withPatchDependencies(shared, [testId(3)])).toEqual(
      new Set([testId(3), testId(1)])
    );
  });

  it("adds what the chosen ops need, and only ops of the patch", () => {
    expect(withPatchDependencies(patch, [testId(4)])).toEqual(
      new Set([testId(4), testId(1), testId(2)])
    );
    expect(withPatchDependencies(patch, [testId(99)])).toEqual(new Set());
  });

  it("finds every op that needs an op", () => {
    expect(patchOpDependents(patch, testId(1))).toEqual(
      new Set([testId(3), testId(4)])
    );
    expect(patchOpDependents(patch, testId(5))).toEqual(new Set());
  });
});

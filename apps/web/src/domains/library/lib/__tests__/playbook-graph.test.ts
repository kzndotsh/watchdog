import { describe, expect, it, assert } from "vitest";

import {
  buildPlaybookGraph,
  failureNote,
  playbookStages,
  stageLabel,
  stepNumbers,
} from "@/domains/library/lib/playbook-graph";

function node<T>(list: readonly T[], i: number): T {
  const found = list[i];
  assert(found !== undefined);
  return found;
}

// Step 1 reads step 0; step 2 reads step 1 (so transitively 0); step 3 reads only the seed.
const DEPS = [[], [0], [0, 1], []];

describe("buildPlaybookGraph", () => {
  const nodes = buildPlaybookGraph(DEPS);

  it("lists what would be skipped if a step failed, transitively", () => {
    expect(nodes.map((n) => n.skippedIfFailed)).toEqual([[1, 2], [2], [], []]);
  });

  it("lists the steps that run independently of each one", () => {
    expect(nodes.map((n) => n.independentOf)).toEqual([
      [3],
      [3],
      [3],
      [0, 1, 2],
    ]);
  });

  it("puts a step one stage after its latest dependency", () => {
    expect(nodes.map((n) => n.stage)).toEqual([0, 1, 2, 0]);
  });

  it("groups steps into stages", () => {
    expect(playbookStages(nodes).map((s) => s.map((n) => n.index))).toEqual([
      [0, 3],
      [1],
      [2],
    ]);
  });

  it("treats a missing row as no dependencies and drops out-of-range ones", () => {
    const sparse = buildPlaybookGraph([[], [7, 1]], 3);
    expect(sparse[1]?.dependsOn).toEqual([]);
    expect(sparse[2]?.independentOf).toEqual([0, 1]);
  });

  it("is empty for a Playbook without steps", () => {
    expect(buildPlaybookGraph([])).toEqual([]);
    expect(playbookStages([])).toEqual([]);
  });
});

describe("step wording", () => {
  const nodes = buildPlaybookGraph([[], [0], [0, 1]], 3);

  it("numbers steps from 1", () => {
    expect(stepNumbers([1])).toBe("step 2");
    expect(stepNumbers([1, 2])).toBe("steps 2, 3");
  });

  it("labels stages", () => {
    expect(stageLabel(0)).toBe("Runs first");
    expect(stageLabel(2)).toBe("Then");
  });

  it("says what a failure skips", () => {
    expect(failureNote(node(nodes, 0))).toBe(
      "If step 1 fails, steps 2, 3 would be skipped."
    );
    expect(failureNote(node(nodes, 2))).toBe(
      "If step 3 fails, no other step is skipped."
    );
  });
});

import { describe, expect, it } from "vitest";

import {
  buildPlaybookGraph,
  playbookStages,
} from "@/domains/library/lib/playbook-graph";

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

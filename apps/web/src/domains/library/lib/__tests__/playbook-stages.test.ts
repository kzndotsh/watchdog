import { describe, expect, it } from "vitest";

import {
  buildStageLayout,
  stageCardState,
} from "@/domains/library/lib/playbook-stages";
import type { LibraryStep } from "@/domains/library/types";

function step(capId: string, dependsOn: number[]): LibraryStep {
  return { capId, title: capId, dependsOn, readiness: { state: "ready" } };
}

// 0 feeds 1 and 2 (via 1); 3 stands alone.
const steps = [step("a", []), step("b", [0]), step("c", [0, 1]), step("d", [])];

describe("buildStageLayout", () => {
  it("groups steps into labelled stage columns with 1-based numbers", () => {
    const { columns } = buildStageLayout(steps);
    expect(columns.map((c) => c.label)).toEqual(["Runs first", "Then", "Then"]);
    expect(columns[0]?.cards.map((c) => c.number)).toEqual([1, 4]);
    expect(columns[2]?.cards[0]?.step.capId).toBe("c");
  });

  it("is empty for no steps", () => {
    expect(buildStageLayout([]).columns).toEqual([]);
  });
});

describe("stageCardState", () => {
  const { nodes } = buildStageLayout(steps);

  it("marks nothing until a step is picked", () => {
    expect(stageCardState(nodes, null, 1)).toEqual({
      isFailed: false,
      isSkipped: false,
    });
  });

  it("marks the failed step and what it skips", () => {
    expect(stageCardState(nodes, 0, 0)).toEqual({
      isFailed: true,
      isSkipped: false,
    });
    expect(stageCardState(nodes, 0, 2).isSkipped).toBe(true);
    expect(stageCardState(nodes, 0, 3).isSkipped).toBe(false);
  });
});

import { describe, it, expect } from "vitest";

import { GRAPH_NODE_HEIGHT } from "@/shared/ui/graph/graph-layout";

import { caseGraphLayout } from "../case-graph-layout";
import {
  CASE_GRAPH_NODE_MARGIN_Y,
  computeDirectedNodeRanks,
  placeLayeredGraphNodes,
} from "../case-graph-ranks";

describe("case-graph-layout", () => {
  it("caseGraphLayout emits one node per entity and one edge per relation", () => {
    const entities = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Alice",
        slug: "alice",
        kind: "person" as const,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Acme",
        slug: "acme",
        kind: "org" as const,
      },
    ];
    const edges = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        fromId: entities[0].id,
        toId: entities[1].id,
        predicate: "owns" as const,
        confidence: "possible" as const,
      },
    ];

    const flow = caseGraphLayout({ entities, edges });
    expect(flow.nodes.length).toBe(2);
    expect(flow.edges.length).toBe(1);
    expect(flow.edges[0]?.source).toBe(entities[0].id);
    expect(flow.edges[0]?.target).toBe(entities[1].id);
    expect(
      flow.nodes.every((n) => typeof n.position.x === "number")
    ).toBeTruthy();
    expect(
      flow.nodes.every((n) => typeof n.position.y === "number")
    ).toBeTruthy();
  });

  it("places the edge target below the source for directed predicates", () => {
    const operatorId = "11111111-1111-4111-8111-111111111111";
    const operatedId = "22222222-2222-4222-8222-222222222222";
    const entities = [
      {
        id: operatorId,
        name: "Operator",
        slug: "operator",
        kind: "person" as const,
      },
      {
        id: operatedId,
        name: "Service",
        slug: "service",
        kind: "infra" as const,
      },
    ];
    const edges = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        fromId: operatorId,
        toId: operatedId,
        predicate: "operates" as const,
        confidence: "possible" as const,
      },
    ];

    const flow = caseGraphLayout({ entities, edges });
    const operator = flow.nodes.find((node) => node.id === operatorId);
    const operated = flow.nodes.find((node) => node.id === operatedId);

    expect(operator).toBeDefined();
    expect(operated).toBeDefined();
    expect(operated!.position.y).toBeGreaterThan(operator!.position.y);
  });

  it("keeps symmetric predicates on the same layer", () => {
    const ranks = computeDirectedNodeRanks(
      ["a", "b"],
      [{ fromId: "a", toId: "b", predicate: "same_as" }]
    );
    const positions = placeLayeredGraphNodes({
      nodeIds: ["a", "b"],
      ranks,
      nodeLabels: new Map([
        ["a", "A"],
        ["b", "B"],
      ]),
    });

    expect(ranks.get("a")).toBe(0);
    expect(ranks.get("b")).toBe(0);
    expect(positions.get("a")?.y).toBe(positions.get("b")?.y);
  });

  it("keeps a comfortable edge gap between two stacked cards", () => {
    const ranks = computeDirectedNodeRanks(
      ["top", "bottom"],
      [{ fromId: "top", toId: "bottom", predicate: "operates" }]
    );
    const positions = placeLayeredGraphNodes({
      nodeIds: ["top", "bottom"],
      ranks,
      nodeLabels: new Map([
        ["top", "Top"],
        ["bottom", "Bottom"],
      ]),
    });

    const top = positions.get("top");
    const bottom = positions.get("bottom");
    expect(top).toBeDefined();
    expect(bottom).toBeDefined();

    const verticalGap = bottom!.y - (top!.y + GRAPH_NODE_HEIGHT);

    expect(verticalGap).toBe(CASE_GRAPH_NODE_MARGIN_Y);
    expect(verticalGap).toBeGreaterThanOrEqual(80);
  });
});

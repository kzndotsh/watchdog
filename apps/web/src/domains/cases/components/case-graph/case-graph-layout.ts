import type {
  ConfidenceTier,
  EdgePredicate,
  EntityKind,
} from "@watchdog/schemas";

import {
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
} from "../../../../shared/ui/graph/graph-layout.ts";
import { confidenceStroke } from "../../../../shared/ui/graph/graph-styles.ts";
import type {
  GraphEdge,
  GraphNode,
} from "../../../../shared/ui/graph/types.ts";
import {
  computeDirectedNodeRanks,
  placeLayeredGraphNodes,
} from "./case-graph-ranks.ts";

export interface CaseGraphEntity {
  id: string;
  name: string;
  slug: string;
  kind: EntityKind;
}

export interface CaseGraphEdgeInput {
  id: string;
  fromId: string;
  toId: string;
  predicate: EdgePredicate;
  confidence: ConfidenceTier;
}

export const CASE_GRAPH_ENTITY_CAP = 150;

export function caseGraphLayout({
  entities,
  edges,
}: {
  entities: CaseGraphEntity[];
  edges: CaseGraphEdgeInput[];
}): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const entityIds = entities.map((entity) => entity.id);
  const entityIdSet = new Set(entityIds);
  const scopedEdges = edges.filter(
    (edge) => entityIdSet.has(edge.fromId) && entityIdSet.has(edge.toId)
  );

  const labels = new Map(entities.map((entity) => [entity.id, entity.name]));
  const ranks = computeDirectedNodeRanks(entityIds, scopedEdges);
  const positions = placeLayeredGraphNodes({
    nodeIds: entityIds,
    ranks,
    nodeLabels: labels,
  });

  const nodes: GraphNode[] = entities.map((entity) => {
    const position = positions.get(entity.id) ?? { x: 0, y: 0 };
    return {
      id: entity.id,
      position,
      width: GRAPH_NODE_WIDTH,
      height: GRAPH_NODE_HEIGHT,
      data: {
        label: entity.name,
        kind: entity.kind,
        slug: entity.slug,
        isCenter: false,
        showMenu: false,
      },
    };
  });

  const flowEdges: GraphEdge[] = scopedEdges.map((edge) => ({
    id: edge.id,
    source: edge.fromId,
    target: edge.toId,
    data: {
      predicate: edge.predicate,
      confidence: edge.confidence,
      edgeId: edge.id,
    },
    style: { stroke: confidenceStroke(edge.confidence) },
  }));

  return { nodes, edges: flowEdges };
}

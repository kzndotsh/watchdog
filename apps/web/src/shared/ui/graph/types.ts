import type {
  ConfidenceTier,
  EdgePredicate,
  EntityKind,
} from "@watchdog/schemas";

export interface EntityNodeData {
  label: string;
  kind: EntityKind;
  slug: string;
  isCenter: boolean;
  /** Ego peer ⋯ menu. */
  showMenu?: boolean;
}

export interface PredicateEdgeData {
  predicate: EdgePredicate;
  confidence: ConfidenceTier;
  edgeId: string;
}

export interface GraphNode {
  id: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: EntityNodeData;
  selected?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  data?: PredicateEdgeData;
  style?: {
    stroke?: string;
    strokeWidth?: number;
  };
  selected?: boolean;
}

/** @deprecated Use {@link GraphNode}. */
export type EntityFlowNode = GraphNode;

/** @deprecated Use {@link GraphEdge}. */
export type PredicateFlowEdge = GraphEdge;

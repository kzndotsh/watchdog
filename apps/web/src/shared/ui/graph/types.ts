import type {
  ConfidenceTier,
  EdgePredicate,
  EntityKind,
} from "@watchdog/schemas/shared";

export type EntityNodeData = {
  label: string;
  kind: EntityKind;
  slug: string;
  isCenter: boolean;
};

export type PredicateEdgeData = {
  predicate: EdgePredicate;
  confidence: ConfidenceTier;
  edgeId: string;
};

export type GraphNode = {
  id: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: EntityNodeData;
  selected?: boolean;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  data?: PredicateEdgeData;
  style?: {
    stroke?: string;
    strokeWidth?: number;
  };
  selected?: boolean;
};

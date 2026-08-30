import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import {
  CASE_GRAPH_ENTITY_CAP,
  caseGraphLayout,
} from "@/domains/cases/components/case-graph/case-graph-layout";
import type { CaseEdgeRecord } from "@/domains/entities/edges/types";
import type { EntityRecord } from "@/domains/entities/types";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/shared/ui/empty-state";
import { GraphCanvas } from "@/shared/ui/graph/graph-canvas";
import { GRAPH_CANVAS_PAGE_SHELL_CLASS } from "@/shared/ui/graph/graph-canvas-skeleton";
import type { GraphNode } from "@/shared/ui/graph/types";

export function CaseGraphCanvas({
  entities,
  edges,
  className,
}: {
  entities: EntityRecord[];
  edges: CaseEdgeRecord[];
  className?: string;
}) {
  const navigate = useNavigate();

  const entityInputs = useMemo(
    () =>
      entities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        slug: entity.slug,
        kind: entity.kind,
      })),
    [entities]
  );

  const edgeInputs = useMemo(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        fromId: edge.fromId,
        toId: edge.toId,
        predicate: edge.predicate,
        confidence: edge.confidence,
      })),
    [edges]
  );

  const flow = useMemo(
    () =>
      caseGraphLayout({
        entities: entityInputs,
        edges: edgeInputs,
      }),
    [entityInputs, edgeInputs]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: GraphNode) => {
      void navigate({
        to: "/entities/$entitySlug",
        params: { entitySlug: node.data.slug },
      });
    },
    [navigate]
  );

  if (entities.length === 0) {
    return (
      <EmptyState
        intent="blank-slate"
        items="entities"
        title="No entities yet"
        description="Add entities to see a case-wide graph preview."
      />
    );
  }

  if (entities.length > CASE_GRAPH_ENTITY_CAP) {
    return (
      <EmptyState
        intent="no-results"
        items="entities"
        title={`Graph preview caps at ${CASE_GRAPH_ENTITY_CAP} entities`}
        description="Open individual Connections tabs on entity dossiers to explore the graph."
      />
    );
  }

  return (
    <div className={cn(GRAPH_CANVAS_PAGE_SHELL_CLASS, className)}>
      <GraphCanvas
        nodes={flow.nodes}
        edges={flow.edges}
        onNodeClick={onNodeClick}
      />
    </div>
  );
}

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import { caseGraphLayout } from "@/domains/cases/components/case-graph/case-graph-layout";
import type { GraphSnapshot } from "@/domains/entities/edges/types";
import { cn } from "@/lib/utils";
import { useWorkCase } from "@/shared/hooks/use-route-case";
import { EmptyState } from "@/shared/ui/empty-state";
import { GraphCanvas } from "@/shared/ui/graph/graph-canvas";
import { GRAPH_CANVAS_PAGE_SHELL_CLASS } from "@/shared/ui/graph/graph-canvas-shell-classes";
import type { GraphNode } from "@/shared/ui/graph/types";

type CaseGraphCanvasProps = {
  entities: GraphSnapshot["entities"];
  edges: GraphSnapshot["edges"];
  className?: string;
};

export function CaseGraphCanvas({
  entities,
  edges,
  className,
}: CaseGraphCanvasProps) {
  const navigate = useNavigate();
  const { slug: caseSlug } = useWorkCase();

  // The snapshot is already the slim shape the layout reads.
  const flow = useMemo(
    () => caseGraphLayout({ entities, edges }),
    [entities, edges]
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: GraphNode) => {
      void navigate({
        to: "/cases/$caseSlug/entities/$entitySlug",
        params: { caseSlug, entitySlug: node.data.slug },
      });
    },
    [navigate, caseSlug]
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

  return (
    <div className={cn(GRAPH_CANVAS_PAGE_SHELL_CLASS, className)}>
      <GraphCanvas
        nodes={flow.nodes}
        edges={flow.edges}
        onNodeClick={handleNodeClick}
      />
    </div>
  );
}

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import type { EdgeRecord } from "@/domains/entities/edges/edges.functions";
import { cn } from "@/lib/utils";
import type { AppAction } from "@/shared/lib/app-action";
import { GraphCanvas } from "@/shared/ui/graph/graph-canvas";
import { GRAPH_CANVAS_FIT_PADDING } from "@/shared/ui/graph/graph-layout";
import type { GraphEdge, GraphNode } from "@/shared/ui/graph/types";
import { predicateLabel } from "@/shared/ui/vocab";

import { edgesToEgoFlow, type EgoEntityRef } from "./edges-to-flow";

export function EgoNeighborhoodCanvas({
  center,
  edges,
  className,
  fillHeight = false,
  onEditEdge,
}: {
  center: EgoEntityRef;
  edges: EdgeRecord[];
  className?: string;
  fillHeight?: boolean;
  onEditEdge?: (edgeId: string) => void;
}) {
  const navigate = useNavigate();

  const flow = useMemo(
    () => edgesToEgoFlow({ center, edges }),
    [center, edges]
  );

  const getNodeActions = useCallback(
    (node: GraphNode): readonly AppAction[] => {
      if (node.id === center.id) return [];

      const connections = flow.edges.flatMap((edge) => {
        if (edge.source !== node.id && edge.target !== node.id) {
          return [];
        }
        return [
          {
            edgeId: edge.data?.edgeId ?? edge.id,
            label: predicateLabel(edge.data?.predicate ?? "", "out"),
          },
        ];
      });

      const target: AppAction[] = [
        {
          id: "ego-open",
          label: "Open dossier",
          group: "target",
          run: () => {
            void navigate({
              to: "/entities/$entitySlug",
              params: { entitySlug: node.data.slug },
              search: { tab: "connections" },
            });
          },
        },
      ];

      if (onEditEdge) {
        for (const connection of connections) {
          target.push({
            id: `ego-edit-${connection.edgeId}`,
            label:
              connections.length === 1
                ? "Edit connection…"
                : `Edit: ${connection.label}`,
            group: "target",
            run: () => {
              onEditEdge(connection.edgeId);
            },
          });
        }
      }

      return target;
    },
    [center.id, flow.edges, navigate, onEditEdge]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: GraphNode) => {
      if (node.id === center.id) {
        return;
      }
      void navigate({
        to: "/entities/$entitySlug",
        params: { entitySlug: node.data.slug },
        search: { tab: "connections" },
      });
    },
    [center.id, navigate]
  );

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: GraphEdge) => {
      onEditEdge?.(edge.data?.edgeId ?? edge.id);
    },
    [onEditEdge]
  );

  const shell = cn(
    "border-border relative overflow-hidden rounded-lg border",
    fillHeight ? "min-h-64 flex-1" : "h-[min(38vh,19rem)] min-h-[17rem]",
    className
  );

  if (flow.nodes.length <= 1) {
    return (
      <div className={cn(shell, "flex items-center p-3")}>
        <p className="text-muted-foreground text-xs">
          No neighbors in the 1-hop graph yet.
        </p>
      </div>
    );
  }

  return (
    <div className={shell}>
      <GraphCanvas
        nodes={flow.nodes}
        edges={flow.edges}
        minZoom={0.3}
        fitPadding={fillHeight ? GRAPH_CANVAS_FIT_PADDING : 0.32}
        onNodeClick={onNodeClick}
        getNodeActions={getNodeActions}
        onEdgeClick={onEdgeClick}
      />
    </div>
  );
}

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import type { EdgeRecord } from "@/domains/entities/edges/edges.functions";
import { cn } from "@/lib/utils";
import { GraphCanvas } from "@/shared/ui/graph/graph-canvas";
import { GRAPH_CANVAS_FIT_PADDING } from "@/shared/ui/graph/graph-layout";
import type { GraphEdge, GraphNode } from "@/shared/ui/graph/types";
import { predicateLabel } from "@/shared/ui/vocab";

import { edgesToEgoFlow, type EgoEntityRef } from "./edges-to-flow";
import { EgoNodeMenu, type EgoMenuNode } from "./ego-node-menu";

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
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    node: EgoMenuNode;
  } | null>(null);

  const flow = useMemo(
    () => edgesToEgoFlow({ center, edges }),
    [center, edges]
  );

  const openMenu = useCallback((node: GraphNode, x: number, y: number) => {
    setMenu({
      x,
      y,
      node: {
        id: node.id,
        label: node.data.label,
        slug: node.data.slug,
      },
    });
  }, []);

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: GraphNode) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("[data-entity-menu]")
      ) {
        event.preventDefault();
        event.stopPropagation();
        openMenu(node, event.clientX, event.clientY);
        return;
      }
      if (node.id === center.id) {
        return;
      }
      setMenu(null);
      void navigate({
        to: "/entities/$entitySlug",
        params: { entitySlug: node.data.slug },
        search: { tab: "connections" },
      });
    },
    [center.id, navigate, openMenu]
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: GraphNode) => {
      event.preventDefault();
      event.stopPropagation();
      if (node.id === center.id) return;
      openMenu(node, event.clientX, event.clientY);
    },
    [center.id, openMenu]
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
        onNodeContextMenu={onNodeContextMenu}
        onEdgeClick={onEdgeClick}
        onPaneClick={() => {
          setMenu(null);
        }}
      />
      {menu ? (
        <EgoNodeMenu
          x={menu.x}
          y={menu.y}
          node={menu.node}
          connections={flow.edges
            .filter(
              (edge) =>
                edge.source === menu.node.id || edge.target === menu.node.id
            )
            .map((edge) => ({
              edgeId: edge.data?.edgeId ?? edge.id,
              label: predicateLabel(edge.data?.predicate ?? "", "out"),
            }))}
          onClose={() => {
            setMenu(null);
          }}
          onEditEdge={onEditEdge}
        />
      ) : null}
    </div>
  );
}

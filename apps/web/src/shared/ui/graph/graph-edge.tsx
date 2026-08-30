"use client";

import { useMemo, useState } from "react";

import {
  graphBezierPath,
  graphIdUnit,
} from "@/shared/ui/graph/graph-bezier";
import { getFloatingEdgeParams, graphNodeRect } from "@/shared/ui/graph/floating-edge";
import { confidenceStroke } from "@/shared/ui/graph/graph-styles";
import type { GraphEdge, GraphNode } from "@/shared/ui/graph/types";
import { predicateLabel } from "@/shared/ui/vocab";

const EDGE_LABEL_BOX_WIDTH = 160;
const EDGE_LABEL_BOX_HEIGHT = 24;

export function GraphEdgePath({
  edge,
  sourceNode,
  targetNode,
  zoom,
  onSelect,
}: {
  edge: GraphEdge;
  sourceNode: GraphNode;
  targetNode: GraphNode;
  zoom: number;
  onSelect?: (edge: GraphEdge, event: React.MouseEvent<SVGPathElement>) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const selected = edge.selected === true;

  const geometry = useMemo(() => {
    const params = getFloatingEdgeParams(
      graphNodeRect(sourceNode),
      graphNodeRect(targetNode)
    );
    const curvature = 0.18 + graphIdUnit(`${edge.id}:curve`) * 0.22;
    const { path, midX, midY } = graphBezierPath({
      ...params,
      curvature,
    });
    return { path, midX, midY };
  }, [edge.id, sourceNode, targetNode]);

  const stroke =
    edge.style?.stroke ??
    confidenceStroke(edge.data?.confidence ?? "unverified");
  const showLabel =
    Boolean(edge.data?.predicate) && (selected || hovered || zoom >= 0.55);
  const label = edge.data?.predicate
    ? predicateLabel(edge.data.predicate, "out")
    : "";

  return (
    <g
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
    >
      <path
        d={geometry.path}
        fill="none"
        stroke={stroke}
        strokeWidth={selected || hovered ? 2.25 : 1.5}
        markerEnd={`url(#graph-arrow-${edge.id})`}
        className={onSelect ? "cursor-pointer" : undefined}
        onClick={
          onSelect
            ? (event) => {
                event.stopPropagation();
                onSelect(edge, event);
              }
            : undefined
        }
      />
      <path
        d={geometry.path}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        className={onSelect ? "cursor-pointer" : undefined}
        onClick={
          onSelect
            ? (event) => {
                event.stopPropagation();
                onSelect(edge, event);
              }
            : undefined
        }
      />
      {showLabel ? (
        <foreignObject
          x={geometry.midX - EDGE_LABEL_BOX_WIDTH / 2}
          y={geometry.midY - EDGE_LABEL_BOX_HEIGHT / 2}
          width={EDGE_LABEL_BOX_WIDTH}
          height={EDGE_LABEL_BOX_HEIGHT}
          className="pointer-events-none overflow-visible"
        >
          <div className="flex h-full w-full items-center justify-center">
            <div
              className="bg-background/95 text-muted-foreground ring-border text-chip max-w-[9rem] truncate rounded px-1.5 py-0.5 whitespace-nowrap shadow-sm ring-1"
              title={label}
            >
              {label}
            </div>
          </div>
        </foreignObject>
      ) : null}
      <defs>
        <marker
          id={`graph-arrow-${edge.id}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
        </marker>
      </defs>
    </g>
  );
}

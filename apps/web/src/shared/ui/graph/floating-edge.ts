import type { GraphNode } from "@/shared/ui/graph/types";
import { graphNodeSize } from "@/shared/ui/graph/graph-layout";

export interface GraphNodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type GraphEdgeSide = "top" | "right" | "bottom" | "left";

export function graphNodeRect(node: GraphNode): GraphNodeRect {
  const { width, height } = graphNodeSize(node);
  return {
    x: node.position.x,
    y: node.position.y,
    width,
    height,
  };
}

function getNodeIntersection(
  intersectionNode: GraphNodeRect,
  targetNode: GraphNodeRect
): { x: number; y: number } {
  const w = intersectionNode.width / 2;
  const h = intersectionNode.height / 2;
  if (w === 0 || h === 0) {
    return {
      x: intersectionNode.x + w,
      y: intersectionNode.y + h,
    };
  }

  const x2 = intersectionNode.x + w;
  const y2 = intersectionNode.y + h;
  const x1 = targetNode.x + targetNode.width / 2;
  const y1 = targetNode.y + targetNode.height / 2;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;

  return {
    x: w * (xx3 + yy3) + x2,
    y: h * (-xx3 + yy3) + y2,
  };
}

function getEdgeSide(
  node: GraphNodeRect,
  intersectionPoint: { x: number; y: number }
): GraphEdgeSide {
  const nx = Math.round(node.x);
  const ny = Math.round(node.y);
  const px = Math.round(intersectionPoint.x);
  const py = Math.round(intersectionPoint.y);

  if (px <= nx + 1) return "left";
  if (px >= nx + node.width - 1) return "right";
  if (py <= ny + 1) return "top";
  if (py >= ny + node.height - 1) return "bottom";
  return "top";
}

/** Card-border anchor points for floating edges. */
export function getFloatingEdgeParams(
  source: GraphNodeRect,
  target: GraphNodeRect
) {
  const sourceIntersectionPoint = getNodeIntersection(source, target);
  const targetIntersectionPoint = getNodeIntersection(target, source);

  return {
    sourcePos: getEdgeSide(source, sourceIntersectionPoint),
    sx: sourceIntersectionPoint.x,
    sy: sourceIntersectionPoint.y,
    targetPos: getEdgeSide(target, targetIntersectionPoint),
    tx: targetIntersectionPoint.x,
    ty: targetIntersectionPoint.y,
  };
}

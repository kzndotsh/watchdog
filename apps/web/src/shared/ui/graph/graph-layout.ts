import type { GraphNode } from "@/shared/ui/graph/types";

/** Entity card footprint for layout math — matches `EntityNode` min width (9rem). */
export const GRAPH_NODE_WIDTH = 144;
export const GRAPH_NODE_HEIGHT = 52;

export const GRAPH_CANVAS_FIT_PADDING = 0.2;
export const GRAPH_CANVAS_MIN_ZOOM = 0.25;
export const GRAPH_CANVAS_MAX_ZOOM = 4;
/** Initial fit never zooms in past 1× — sparse graphs keep breathing room. */
export const GRAPH_CANVAS_FIT_MAX_ZOOM = 1;
/** Minimum graph-space frame used for fit so 1–2 nodes do not fill the viewport. */
export const GRAPH_CANVAS_MIN_FIT_BOUNDS_WIDTH = 560;
export const GRAPH_CANVAS_MIN_FIT_BOUNDS_HEIGHT = 420;

export interface GraphBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphTransform {
  x: number;
  y: number;
  k: number;
}

export function graphNodeSize(node: GraphNode): { width: number; height: number } {
  return {
    width: node.width ?? GRAPH_NODE_WIDTH,
    height: node.height ?? GRAPH_NODE_HEIGHT,
  };
}

export function computeGraphBounds(nodes: GraphNode[]): GraphBounds | null {
  if (nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const { width, height } = graphNodeSize(node);
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + width);
    maxY = Math.max(maxY, node.position.y + height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/** Pad tiny node clusters to a comfortable fit frame (does not move nodes). */
export function expandBoundsForFit(bounds: GraphBounds): GraphBounds {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const width = Math.max(bounds.width, GRAPH_CANVAS_MIN_FIT_BOUNDS_WIDTH);
  const height = Math.max(bounds.height, GRAPH_CANVAS_MIN_FIT_BOUNDS_HEIGHT);

  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Fit graph bounds into a container — same role as xyflow fitView. */
export function computeGraphFitTransform({
  bounds,
  width,
  height,
  padding = GRAPH_CANVAS_FIT_PADDING,
  minZoom = GRAPH_CANVAS_MIN_ZOOM,
  maxFitZoom = GRAPH_CANVAS_FIT_MAX_ZOOM,
}: {
  bounds: GraphBounds;
  width: number;
  height: number;
  padding?: number;
  minZoom?: number;
  maxFitZoom?: number;
}): GraphTransform {
  if (width <= 0 || height <= 0) {
    return { x: 0, y: 0, k: 1 };
  }

  const frame = expandBoundsForFit(bounds);
  const padX = width * padding;
  const padY = height * padding;
  const innerW = Math.max(width - padX * 2, 1);
  const innerH = Math.max(height - padY * 2, 1);
  const boundsW = Math.max(frame.width, 1);
  const boundsH = Math.max(frame.height, 1);

  const fitZoom = Math.min(innerW / boundsW, innerH / boundsH);
  const zoom = clamp(fitZoom, minZoom, maxFitZoom);

  return {
    x: width / 2 - (frame.x + frame.width / 2) * zoom,
    y: height / 2 - (frame.y + frame.height / 2) * zoom,
    k: zoom,
  };
}

import type { GraphEdgeSide } from "@/shared/ui/graph/floating-edge";

/** Stable 0–1 from id — staggers label offsets without Math.random flicker. */
export function graphIdUnit(id: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < id.length; i += 1) {
    const code = id.codePointAt(i) ?? 0;
    h = Math.imul(h + code + i * 31, 16_777_619);
  }
  const positive = ((h % 1_000_000) + 1_000_000) % 1_000_000;
  return positive / 1_000_000;
}

export interface GraphBezierParams {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePos: GraphEdgeSide;
  targetPos: GraphEdgeSide;
  curvature: number;
}

function controlPointForSide(
  x: number,
  y: number,
  side: GraphEdgeSide,
  offset: number
): { x: number; y: number } {
  switch (side) {
    case "left": {
      return { x: x - offset, y };
    }
    case "right": {
      return { x: x + offset, y };
    }
    case "top": {
      return { x, y: y - offset };
    }
    case "bottom": {
      return { x, y: y + offset };
    }
    default: {
      const _exhaustive: never = side;
      return _exhaustive;
    }
  }
}

function resolveGraphBezierControls({
  sx,
  sy,
  tx,
  ty,
  sourcePos,
  targetPos,
  curvature,
}: GraphBezierParams) {
  const distance = Math.hypot(tx - sx, ty - sy);
  const offset = Math.max(distance * curvature, 48);
  const c1 = controlPointForSide(sx, sy, sourcePos, offset);
  const c2 = controlPointForSide(tx, ty, targetPos, offset);

  return {
    c1x: c1.x,
    c1y: c1.y,
    c2x: c2.x,
    c2y: c2.y,
  };
}

/** Point along the edge bezier at t ∈ [0, 1]. */
export function graphBezierPointAt(
  t: number,
  params: GraphBezierParams
): { x: number; y: number } {
  const { sx, sy, tx, ty } = params;
  const { c1x, c1y, c2x, c2y } = resolveGraphBezierControls(params);
  const u = 1 - t;

  return {
    x:
      u * u * u * sx +
      3 * u * u * t * c1x +
      3 * u * t * t * c2x +
      t * t * t * tx,
    y:
      u * u * u * sy +
      3 * u * u * t * c1y +
      3 * u * t * t * c2y +
      t * t * t * ty,
  };
}

export function graphBezierPath(
  params: GraphBezierParams
): { path: string; midX: number; midY: number } {
  const { sx, sy, tx, ty } = params;
  const { c1x, c1y, c2x, c2y } = resolveGraphBezierControls(params);
  const mid = graphBezierPointAt(0.5, params);

  return {
    path: `M ${sx},${sy} C ${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`,
    midX: mid.x,
    midY: mid.y,
  };
}

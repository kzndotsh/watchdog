import type { GraphTransform } from "@/shared/ui/graph/graph-layout";
import { GRAPH_CANVAS_MIN_ZOOM } from "@/shared/ui/graph/graph-layout";

/** Shared graph canvas chrome. */
export const GRAPH_CANVAS_BG_CLASS = "bg-muted/20!";
export const GRAPH_CANVAS_DOT_GAP = 16;
export const GRAPH_CANVAS_DOT_SIZE = 1;
/** Peak dot contrast at comfortable zoom (color-mix %). */
export const GRAPH_CANVAS_DOT_MIX_PEAK = 22;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Fade dots when zoomed out — dense screen grid reads harsh at low k. */
export function graphCanvasDotMixPercent(zoom: number): number {
  const screenGap = GRAPH_CANVAS_DOT_GAP * zoom;
  const gapFactor = clamp(screenGap / 12, 0.12, 1);
  const zoomOutFactor =
    zoom >= 1
      ? 1
      : clamp(
          (zoom - GRAPH_CANVAS_MIN_ZOOM) / (1 - GRAPH_CANVAS_MIN_ZOOM),
          0.15,
          1
        );

  return GRAPH_CANVAS_DOT_MIX_PEAK * gapFactor * zoomOutFactor;
}

function graphCanvasDotColor(zoom: number): string {
  const mix = graphCanvasDotMixPercent(zoom);
  if (mix <= 0.5) {
    return "transparent";
  }
  return `color-mix(in oklch, var(--muted-foreground) ${mix.toFixed(1)}%, transparent)`;
}

/** Viewport-fixed dot grid — even 16px spacing from the canvas origin (matches loader). */
export function graphCanvasDotStyle(_transform?: GraphTransform) {
  const dotColor = graphCanvasDotColor(1);

  return {
    backgroundImage: `radial-gradient(circle, ${dotColor} ${GRAPH_CANVAS_DOT_SIZE}px, transparent ${GRAPH_CANVAS_DOT_SIZE}px)`,
    backgroundSize: `${GRAPH_CANVAS_DOT_GAP}px ${GRAPH_CANVAS_DOT_GAP}px`,
    backgroundPosition: "0px 0px",
  } as const;
}

/** Static dots for skeleton / pre-fit placeholder. */
export const GRAPH_CANVAS_DOT_STYLE = graphCanvasDotStyle();

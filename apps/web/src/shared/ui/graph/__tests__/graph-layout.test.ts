import { describe, expect, it } from "vitest";

import {
  computeGraphFitTransform,
  expandBoundsForFit,
  GRAPH_CANVAS_FIT_MAX_ZOOM,
  GRAPH_CANVAS_MIN_FIT_BOUNDS_HEIGHT,
  GRAPH_CANVAS_MIN_FIT_BOUNDS_WIDTH,
} from "@/shared/ui/graph/graph-layout";
import { graphCanvasDotMixPercent, graphCanvasDotStyle } from "@/shared/ui/graph/graph-canvas-background";
import { graphBezierPath } from "@/shared/ui/graph/graph-bezier";

describe("expandBoundsForFit", () => {
  it("expands tiny clusters to the minimum fit frame", () => {
    const expanded = expandBoundsForFit({
      x: 0,
      y: 0,
      width: 180,
      height: 52,
    });

    expect(expanded.width).toBe(GRAPH_CANVAS_MIN_FIT_BOUNDS_WIDTH);
    expect(expanded.height).toBe(GRAPH_CANVAS_MIN_FIT_BOUNDS_HEIGHT);
  });
});

describe("computeGraphFitTransform", () => {
  it("caps initial fit zoom for sparse graphs", () => {
    const transform = computeGraphFitTransform({
      bounds: { x: -80, y: -26, width: 220, height: 52 },
      width: 960,
      height: 540,
    });

    expect(transform.k).toBeLessThanOrEqual(GRAPH_CANVAS_FIT_MAX_ZOOM);
    expect(transform.k).toBeGreaterThan(0.2);
  });
});

describe("graphCanvasDotMixPercent", () => {
  it("softens dots when zoomed out", () => {
    const atDefault = graphCanvasDotMixPercent(1);
    const zoomedOut = graphCanvasDotMixPercent(0.3);

    expect(atDefault).toBeGreaterThan(zoomedOut);
    expect(zoomedOut).toBeLessThan(8);
  });
});

describe("graphCanvasDotStyle", () => {
  it("keeps an even viewport grid regardless of fit transform", () => {
    const styled = graphCanvasDotStyle({ x: 120, y: 84, k: 0.42 });

    expect(styled.backgroundPosition).toBe("0px 0px");
    expect(styled.backgroundSize).toBe("16px 16px");
  });
});

describe("graphBezierPath", () => {
  it("places the label anchor on the curve midpoint for horizontal edges", () => {
    const { midX, midY } = graphBezierPath({
      sx: 0,
      sy: 50,
      tx: 100,
      ty: 50,
      sourcePos: "right",
      targetPos: "left",
      curvature: 0.25,
    });

    expect(midX).toBeCloseTo(50, 0);
    expect(midY).toBeCloseTo(50, 0);
  });

  it("keeps vertical edge tangents vertical", () => {
    const { midX, midY } = graphBezierPath({
      sx: 50,
      sy: 0,
      tx: 50,
      ty: 100,
      sourcePos: "bottom",
      targetPos: "top",
      curvature: 0.25,
    });

    expect(midX).toBeCloseTo(50, 0);
    expect(midY).toBeCloseTo(50, 0);
  });
});

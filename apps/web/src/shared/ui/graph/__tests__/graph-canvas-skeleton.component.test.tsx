import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GraphCanvasSkeleton } from "@/shared/ui/graph/graph-canvas-skeleton";

describe("GraphCanvasSkeleton", () => {
  it("renders dot grid shell, three triangle cards, and connecting edges", () => {
    const { container } = render(
      <GraphCanvasSkeleton className="h-96 w-full" />
    );

    expect(
      container.querySelector("[data-slot='graph-canvas-skeleton']")
    ).toBeInTheDocument();
    expect(container.querySelectorAll("[data-graph-node-skeleton]")).toHaveLength(
      3
    );
    expect(container.querySelectorAll("line")).toHaveLength(3);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(6);
  });
});

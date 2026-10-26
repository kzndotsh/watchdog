import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/testing/render-in-case";

vi.mock("@/shared/ui/graph/graph-canvas", () => ({
  GraphCanvas: ({ nodes }: { nodes: { id: string }[] }) => (
    <div data-testid="graph-canvas" data-node-count={nodes.length} />
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

import { CaseGraphCanvas } from "@/domains/cases/components/case-graph/case-graph-canvas";
import type { GraphSnapshot } from "@/domains/entities/edges/types";

const ENTITY: GraphSnapshot["entities"][number] = {
  id: "ent-1",
  slug: "alpha",
  name: "Alpha",
  kind: "person",
};

function renderCanvas(props: ComponentProps<typeof CaseGraphCanvas>) {
  return render(<CaseGraphCanvas {...props} />);
}

describe("CaseGraphCanvas", () => {
  it("shows a blank slate when there are no entities", async () => {
    renderCanvas({ entities: [], edges: [] });
    expect(await screen.findByText("No entities yet")).toBeInTheDocument();
  });

  it("draws every Entity of the snapshot: the server has already capped it", async () => {
    const entities = Array.from({ length: 151 }, (_, i) => ({
      ...ENTITY,
      id: `ent-${String(i)}`,
      slug: `entity-${String(i)}`,
      name: `Entity ${String(i)}`,
    }));
    renderCanvas({ entities, edges: [] });
    expect(await screen.findByTestId("graph-canvas")).toHaveAttribute(
      "data-node-count",
      "151"
    );
  });
});

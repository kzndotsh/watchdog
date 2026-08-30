import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/shared/ui/graph/graph-canvas", () => ({
  GraphCanvas: ({ nodes }: { nodes: { id: string }[] }) => (
    <div data-testid="graph-canvas" data-node-count={nodes.length} />
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

import { CaseGraphCanvas } from "@/domains/cases/components/case-graph/case-graph-canvas";
import { CASE_GRAPH_ENTITY_CAP } from "@/domains/cases/components/case-graph/case-graph-layout";
import type { EntityRecord } from "@/domains/entities/types";

const ENTITY: EntityRecord = {
  id: "ent-1",
  caseId: "case-1",
  slug: "alpha",
  name: "Alpha",
  kind: "person",
  summary: null,
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderCanvas(props: ComponentProps<typeof CaseGraphCanvas>) {
  return render(<CaseGraphCanvas {...props} />);
}

describe("CaseGraphCanvas", () => {
  it("shows a blank slate when there are no entities", async () => {
    renderCanvas({ entities: [], edges: [] });
    expect(await screen.findByText("No entities yet")).toBeInTheDocument();
  });

  it("shows a cap message when the entity count exceeds the preview limit", async () => {
    const entities = Array.from(
      { length: CASE_GRAPH_ENTITY_CAP + 1 },
      (_, i) => ({
        ...ENTITY,
        id: `ent-${i}`,
        slug: `entity-${i}`,
        name: `Entity ${i}`,
      })
    );
    renderCanvas({ entities, edges: [] });
    expect(
      await screen.findByText(
        `Graph preview caps at ${CASE_GRAPH_ENTITY_CAP} entities`
      )
    ).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/shared/ui/graph/graph-canvas", () => ({
  GraphCanvas: () => null,
}));

import { EgoNeighborhoodCanvas } from "@/domains/dossier/components/ego-graph/ego-neighborhood-canvas";

describe("EgoNeighborhoodCanvas", () => {
  it("shows a blank slate when there are no neighbor nodes", () => {
    render(
      <EgoNeighborhoodCanvas
        center={{
          id: testId(1),
          name: "Alpha",
          slug: "alpha",
          kind: "person",
        }}
        edges={[]}
      />
    );
    expect(
      screen.getByText("No neighbors in the 1-hop graph yet.")
    ).toBeInTheDocument();
  });
});

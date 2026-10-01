import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusDot } from "@/shared/ui/status-dot";

describe("StatusDot", () => {
  it("renders a labeled glyph with tooltip by default", () => {
    render(<StatusDot status="running" pulse />);

    const dot = screen.getByLabelText("Running");
    expect(dot).toHaveAttribute("data-status", "running");
    expect(dot.className).toContain("animate-spin");
  });

  it("renders without tooltip when disabled", () => {
    render(<StatusDot status="queued" tooltip={false} />);
    expect(screen.getByLabelText("Queued")).toBeInTheDocument();
  });
});

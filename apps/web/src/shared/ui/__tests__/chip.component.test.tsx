import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CHIP_SIZE_CLASS, Chip } from "@/shared/ui/chip";

describe("Chip", () => {
  it("renders badge content with shared chip sizing", () => {
    render(<Chip size="sm">json</Chip>);
    expect(screen.getByText("json")).toBeInTheDocument();
    expect(CHIP_SIZE_CLASS.sm).toContain("text-2xs");
  });

  it("renders label with tone classes", () => {
    render(
      <Chip
        label="Queued"
        tone={{
          low: "bg-status-queued-bg text-status-queued-fg",
          high: "bg-status-queued text-primary-foreground",
        }}
      />
    );
    expect(screen.getByText("Queued")).toHaveClass("bg-status-queued-bg");
  });

  it("uses the high-contrast tone when asked", () => {
    render(
      <Chip
        label="Queued"
        contrast="high"
        tone={{ low: "bg-muted", high: "bg-status-queued" }}
      />
    );
    expect(screen.getByText("Queued")).toHaveClass("bg-status-queued");
  });

  it("prefers children over the label", () => {
    render(<Chip label="Hidden">Visible</Chip>);
    expect(screen.getByText("Visible")).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });
});

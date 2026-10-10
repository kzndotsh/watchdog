import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EYEBROW_CLASS, Eyebrow } from "@/shared/ui/eyebrow";

describe("Eyebrow", () => {
  it("renders an uppercase tracked muted label in a span", () => {
    render(<Eyebrow>Fact</Eyebrow>);
    const label = screen.getByText("Fact");
    expect(label.tagName).toBe("SPAN");
    expect(label).toHaveClass("text-xs", "tracking-wider", "uppercase");
    expect(label).toHaveClass("text-muted-foreground");
  });

  it("switches ink with tone", () => {
    const { rerender } = render(<Eyebrow tone="foreground">Fact</Eyebrow>);
    expect(screen.getByText("Fact")).toHaveClass("text-foreground");
    expect(screen.getByText("Fact")).not.toHaveClass("text-muted-foreground");

    rerender(<Eyebrow tone="inherit">Fact</Eyebrow>);
    expect(screen.getByText("Fact")).not.toHaveClass("text-foreground");
    expect(screen.getByText("Fact")).not.toHaveClass("text-muted-foreground");
  });

  it("renders as another element and merges layout classes", () => {
    render(
      <Eyebrow as="div" className="truncate">
        Fact
      </Eyebrow>
    );
    const label = screen.getByText("Fact");
    expect(label.tagName).toBe("DIV");
    expect(label).toHaveClass("truncate", "uppercase");
  });

  it("exports the class string for components that take a className", () => {
    expect(EYEBROW_CLASS).toBe("text-xs tracking-wider uppercase");
  });
});

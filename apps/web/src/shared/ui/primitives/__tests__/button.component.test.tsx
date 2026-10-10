import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/shared/ui/primitives/button";

/** Height each size resolves to, as the scale documents it (DESIGN.md Components). */
const HEIGHT_CLASS = {
  xs: "h-5",
  sm: "h-6",
  default: "h-7",
  lg: "h-8",
  icon: "size-7",
  "icon-xs": "size-5",
  "icon-sm": "size-6",
  "icon-lg": "size-8",
} as const;

type HeightSize = keyof typeof HEIGHT_CLASS;

const SIZES = Object.keys(HEIGHT_CLASS) as HeightSize[];

describe("Button sizes", () => {
  it.each(SIZES)("size %s carries its height and reports data-size", (size) => {
    render(<Button size={size}>Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveClass(HEIGHT_CLASS[size]);
    expect(button).toHaveAttribute("data-size", size);
  });

  it("defaults to the default size", () => {
    render(<Button>Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveClass("h-7");
    expect(button).toHaveAttribute("data-size", "default");
  });

  it("inline drops the control height and padding for a text link", () => {
    render(
      <Button size="inline" variant="link">
        Open
      </Button>
    );
    const button = screen.getByRole("button", { name: "Open" });
    expect(button).toHaveClass("h-auto", "min-h-0", "p-0");
    expect(button).not.toHaveClass("h-7");
    expect(button).not.toHaveClass("px-2");
    expect(button).toHaveAttribute("data-size", "inline");
    expect(button).toHaveAttribute("data-variant", "link");
  });

  it("keeps a caller class that is not a height next to inline", () => {
    render(
      <Button size="inline" variant="link" className="text-muted-foreground">
        Open
      </Button>
    );
    expect(screen.getByRole("button", { name: "Open" })).toHaveClass(
      "text-muted-foreground",
      "h-auto"
    );
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TimelineDot } from "@/shared/ui/timeline-dot";
import { TimelineSpine } from "@/shared/ui/timeline-spine";

describe("TimelineSpine", () => {
  it("renders dashed spine content and dot markers", () => {
    render(
      <TimelineSpine className="ml-2 pl-4">
        <TimelineDot className="bg-accent" />
        <div>Event body</div>
      </TimelineSpine>
    );

    expect(screen.getByText("Event body")).toBeInTheDocument();
    expect(document.querySelector(".border-dashed")).toBeInTheDocument();
  });
});

describe("TimelineDot", () => {
  const dot = () => {
    const el = document.querySelector('[data-slot="timeline-dot"]');
    if (!(el instanceof HTMLElement)) throw new Error("no dot rendered");
    return el;
  };

  it("carries the one offset, vertical anchor and the diameter for each size", () => {
    const { rerender } = render(<TimelineDot />);
    expect(dot()).toHaveClass(
      "absolute",
      "top-1.5",
      "-left-[calc(1rem+0.5px)]",
      "-translate-x-1/2",
      "size-2"
    );

    rerender(<TimelineDot size="md" />);
    expect(dot()).toHaveClass("-left-[calc(1rem+0.5px)]", "size-2.5");
    expect(dot()).not.toHaveClass("size-2");
  });

  it("takes colour from the caller", () => {
    render(<TimelineDot className="bg-foreground" />);
    expect(dot()).toHaveClass("bg-foreground");
  });
});

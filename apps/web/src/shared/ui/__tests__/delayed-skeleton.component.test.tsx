import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SKELETON_DELAY_CLASS } from "@/shared/lib/skeleton-delay";
import { DelayedSkeleton } from "@/shared/ui/delayed-skeleton";
import { LoadingRegion } from "@/shared/ui/loading-region";

describe("skeleton show-delay structure", () => {
  it("DelayedSkeleton keeps the skeleton mounted inside the delay wrapper", () => {
    render(
      <DelayedSkeleton className="extra">
        <div data-testid="bone">bone</div>
      </DelayedSkeleton>
    );
    const bone = screen.getByTestId("bone");
    expect(bone.parentElement).toHaveClass(SKELETON_DELAY_CLASS, "extra");
  });

  it("LoadingRegion delays the busy region without changing aria channels", () => {
    render(
      <LoadingRegion label="Loading things" className="flex">
        <div data-testid="bone">bone</div>
      </LoadingRegion>
    );
    const region = screen.getByRole("generic", { busy: true });
    expect(region).toHaveClass(SKELETON_DELAY_CLASS, "flex");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading things");
    expect(
      screen.getByTestId("bone").closest("[aria-hidden='true']")
    ).toBeTruthy();
  });

  it("LoadingRegion not busy renders no delay wrapper", () => {
    const { container } = render(
      <LoadingRegion label="x" isBusy={false}>
        <span>live</span>
      </LoadingRegion>
    );
    expect(container.querySelector(`.${SKELETON_DELAY_CLASS}`)).toBeNull();
  });
});

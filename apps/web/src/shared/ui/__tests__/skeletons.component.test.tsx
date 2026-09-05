import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  BoardSkeleton,
  CardGridSkeleton,
  CollectDetailSkeleton,
  CollectQueueSkeleton,
  LoadingRegion,
  QueueSkeleton,
  RoutePendingSkeletonLayout,
  StackBodySkeleton,
} from "@/shared/ui/skeletons";

describe("Skeletons", () => {
  it("LoadingRegion exposes aria-busy shield and sr-only status", () => {
    render(
      <LoadingRegion label="Loading items">
        <div data-testid="skeleton-content">placeholder</div>
      </LoadingRegion>
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading items");
    const busy = screen.getByRole("generic", { busy: true });
    expect(busy).toHaveAttribute("aria-busy");
    expect(
      screen.getByTestId("skeleton-content").closest("[aria-hidden='true']")
    ).toBeTruthy();
  });

  it("renders shape-correct board and card grid skeletons", () => {
    const { container: board } = render(
      <BoardSkeleton columns={2} cardsPerColumn={2} />
    );
    expect(board.querySelectorAll(".min-w-\\[14rem\\]")).toHaveLength(2);

    const { container: grid } = render(<CardGridSkeleton slots={3} />);
    expect(grid.querySelectorAll(".rounded-lg")).toHaveLength(3);
  });

  it("renders Collect queue and detail skeletons with day groups and tab strip", () => {
    const { container: queue } = render(<CollectQueueSkeleton rows={4} />);
    expect(
      queue.querySelector("[data-slot='section-header-bar']")
    ).toBeInTheDocument();
    expect(queue.querySelectorAll(".size-2.rounded-full")).toHaveLength(4);
    expect(
      queue.querySelectorAll("[data-slot='collect-queue-row-skeleton']")
    ).toHaveLength(4);
    expect(
      queue.querySelectorAll(
        "[data-slot='section-header-bar'][data-variant='sticky']"
      )
    ).toHaveLength(0);
    expect(
      queue.querySelectorAll(
        "[data-slot='section-header-bar'][data-variant='panel']"
      ).length
    ).toBeGreaterThan(0);

    const { container: detail } = render(<CollectDetailSkeleton />);
    expect(detail.querySelector(".h-40")).toBeInTheDocument();
    expect(detail.querySelector("[data-slot='tabs-list']")).toBeInTheDocument();
    expect(
      detail.querySelector("[data-slot='detail-footer']")
    ).toBeInTheDocument();
    expect(
      detail.querySelector("[data-slot='artifact-preview-skeleton']")
    ).toBeInTheDocument();
    expect(detail.querySelectorAll("[data-slot='meta-row']")).toHaveLength(0);
  });

  it("renders queue and stack loading placeholders", () => {
    const { container: queue } = render(<QueueSkeleton rows={2} />);
    expect(queue.querySelectorAll(".border-b")).toHaveLength(2);

    const { container: stack } = render(
      <LoadingRegion label="Loading content">
        <StackBodySkeleton sections={1} />
      </LoadingRegion>
    );
    expect(stack.querySelector("[aria-busy='true']")).toBeInTheDocument();
  });

  it("keeps the full-page pending shell as a single stacked column", () => {
    const { container } = render(<RoutePendingSkeletonLayout />);
    const root = container.firstElementChild;
    expect(root).toHaveClass("flex", "flex-col");
    expect(root?.children).toHaveLength(2);
  });
});

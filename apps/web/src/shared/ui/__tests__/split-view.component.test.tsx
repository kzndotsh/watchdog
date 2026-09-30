import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/hooks/use-hydrated", () => ({
  useHydrated: () => true,
}));

const narrow = vi.hoisted(() => ({ value: false }));
vi.mock("@/shared/hooks/use-mobile", () => ({
  useIsMobile: () => narrow.value,
}));

vi.mock("@/shared/ui/shadcn/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="split-group">{children}</div>
  ),
  ResizablePanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResizableHandle: () => <div />,
}));

import { QueueRow } from "@/shared/ui/queue-row";
import { SplitView } from "@/shared/ui/split-view";

describe("SplitView", () => {
  it("renders list and detail columns when hydrated", () => {
    render(<SplitView list={<div>Queue</div>} detail={<div>Detail</div>} />);

    expect(screen.getByTestId("split-group")).toBeInTheDocument();
    expect(screen.getByText("Queue")).toBeInTheDocument();
    expect(screen.getByText("Detail")).toBeInTheDocument();
  });

  it("stacks Queue then Detail on narrow viewports", () => {
    narrow.value = true;
    render(
      <SplitView
        backLabel="Items"
        list={<QueueRow>Row one</QueueRow>}
        detail={<div>Detail</div>}
      />
    );
    expect(screen.queryByTestId("split-group")).toBeNull();
    expect(screen.queryByText("Detail")).toBeNull();

    fireEvent.click(screen.getByText("Row one"));
    expect(screen.getByText("Detail")).toBeInTheDocument();
    expect(screen.queryByText("Row one")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Items" }));
    expect(screen.getByText("Row one")).toBeInTheDocument();
    narrow.value = false;
  });
});

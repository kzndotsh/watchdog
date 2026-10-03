import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

import { Page } from "@/shared/layout/page";

describe("Page layout", () => {
  it("renders page content with default density overflow", () => {
    const { container } = render(
      <Page>
        <p>Body copy</p>
      </Page>
    );
    expect(screen.getByText("Body copy")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("overflow-y-auto");
  });

  it("uses split density without vertical scroll on the frame", () => {
    const { container } = render(
      <Page density="split">
        <p>Split pane</p>
      </Page>
    );
    expect(container.firstChild).toHaveClass("overflow-hidden");
  });

  it("marks the page hydrated once committed and clears the mark on unmount", () => {
    const root = document.documentElement;
    expect(root.dataset.pageHydrated).toBeUndefined();
    const { unmount } = render(
      <Page>
        <p>Body copy</p>
      </Page>
    );
    expect(root.dataset.pageHydrated).toBe("true");
    unmount();
    expect(root.dataset.pageHydrated).toBeUndefined();
  });
});

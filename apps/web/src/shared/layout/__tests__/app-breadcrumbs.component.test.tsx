import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  };
});

import { AppBreadcrumbs } from "@/shared/layout/app-breadcrumbs";
import {
  PageTrailContext,
  type PageTrailState,
} from "@/shared/layout/page-trail-context";

const TRAIL: PageTrailState = {
  items: [
    { id: "home", label: "Dashboard", href: { to: "/" } },
    { id: "tasks", label: "Tasks" },
  ],
  isPendingLast: false,
  isPlaceholderLast: false,
  isErrorLast: false,
};

function withTrail(trail: PageTrailState, ui: ReactNode) {
  return <PageTrailContext value={trail}>{ui}</PageTrailContext>;
}

describe("AppBreadcrumbs", () => {
  it("renders ancestor links and the current crumb", () => {
    render(
      withTrail(
        TRAIL,
        <AppBreadcrumbs current="Overview" count={3} countOn="tasks" />
      )
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("returns null when the trail is empty", () => {
    const { container } = render(<AppBreadcrumbs />);
    expect(container).toBeEmptyDOMElement();
  });
});

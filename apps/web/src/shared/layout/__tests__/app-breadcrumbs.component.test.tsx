import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const usePageTrailMock = vi.hoisted(() =>
  vi.fn(() => ({
    items: [
      { id: "home", label: "Dashboard", href: { to: "/" as const } },
      { id: "tasks", label: "Tasks", href: { to: "/tasks" as const } },
    ],
    pendingLast: false,
    placeholderLast: false,
    errorLast: false,
  }))
);

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

vi.mock("@/shared/layout/use-page-trail", () => ({
  usePageTrail: usePageTrailMock,
}));

import { AppBreadcrumbs } from "@/shared/layout/app-breadcrumbs";

describe("AppBreadcrumbs", () => {
  it("renders ancestor links and the current crumb", () => {
    render(<AppBreadcrumbs current="Overview" count={3} countOn="tasks" />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("returns null when the trail is empty", () => {
    usePageTrailMock.mockReturnValueOnce({
      items: [],
      pendingLast: false,
      placeholderLast: false,
      errorLast: false,
    });
    const { container } = render(<AppBreadcrumbs />);
    expect(container).toBeEmptyDOMElement();
  });
});

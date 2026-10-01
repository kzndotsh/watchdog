import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

vi.mock("@watchdog/ui/components/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

import { RoutePending } from "@/shared/layout/route-pending";

describe("RoutePending", () => {
  it("renders a busy queue pending shell", () => {
    const { container } = render(<RoutePending variant="queue" />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("renders a stack skeleton for dashboard-style pages", () => {
    const { container } = render(<RoutePending variant="stack" />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });
});

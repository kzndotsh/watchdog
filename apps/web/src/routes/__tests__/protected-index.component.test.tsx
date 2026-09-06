import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  };
});

vi.mock("@/domains/dashboard/components/dashboard-home", () => ({
  DashboardHome: () => <div>Dashboard home</div>,
}));

const warmDashboardQueriesMock = vi.hoisted(() => vi.fn());

vi.mock("@/domains/dashboard/lib/prefetch-dashboard", () => ({
  warmDashboardQueries: warmDashboardQueriesMock,
}));

import { Route } from "@/routes/_protected/index";

const ACTIVE = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

describe("protected dashboard index route", () => {
  it("warms dashboard queries from the loader", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ active: ACTIVE, cases: [ACTIVE] });
    const queryClient = { query };
    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await loader({ context: { queryClient } } as never);

    expect(warmDashboardQueriesMock).toHaveBeenCalledWith(
      queryClient,
      ACTIVE.id
    );
  });

  it("renders the dashboard home page", () => {
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Dashboard home")).toBeInTheDocument();
  });
});

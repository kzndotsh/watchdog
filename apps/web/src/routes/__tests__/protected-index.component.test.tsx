import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    getRouteApi: () => ({
      useSearch: () => ({}),
      useNavigate: () => vi.fn(),
    }),
  };
});

vi.mock("@/domains/dashboard/components/dashboard-home", () => ({
  DashboardHome: () => <div>Dashboard home</div>,
}));

const warmDashboardQueriesMock = vi.hoisted(() => vi.fn());

vi.mock("@/domains/dashboard/lib/prefetch-dashboard", () => ({
  warmDashboardQueries: warmDashboardQueriesMock,
}));

import {
  LAST_CASE_STORAGE_KEY,
  rememberLastCase,
} from "@/domains/cases/lib/active-case";
import { Route } from "@/routes/_protected/index";

const ACTIVE = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

const FIRST = { ...ACTIVE, id: testId(11), slug: "first", name: "First" };

describe("protected dashboard index route", () => {
  afterEach(() => {
    window.localStorage.removeItem(LAST_CASE_STORAGE_KEY);
    warmDashboardQueriesMock.mockClear();
  });

  async function runLoader() {
    const query = vi.fn().mockResolvedValue([FIRST, ACTIVE]);
    const queryClient = { query };
    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;
    await loader({ context: { queryClient } } as never);
    return queryClient;
  }

  it("warms dashboard queries for the last Case entered", async () => {
    rememberLastCase(ACTIVE.id);
    const queryClient = await runLoader();

    expect(warmDashboardQueriesMock).toHaveBeenCalledWith(
      queryClient,
      ACTIVE.id
    );
  });

  it("warms the first visible Case when none was entered yet", async () => {
    const queryClient = await runLoader();

    expect(warmDashboardQueriesMock).toHaveBeenCalledWith(
      queryClient,
      FIRST.id
    );
  });

  it("renders the dashboard home page", () => {
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Dashboard home")).toBeInTheDocument();
  });
});

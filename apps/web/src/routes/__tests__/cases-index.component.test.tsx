import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

vi.mock("@/domains/cases/components/case-list", () => ({
  CaseList: () => <div>Case list</div>,
}));

import { Route } from "@/routes/_protected/cases/index";

describe("cases index route", () => {
  it("prefetches cases context in the loader", async () => {
    const query = vi.fn().mockResolvedValue({ active: null, cases: [] });

    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await loader({
      context: { queryClient: { query } },
    } as never);

    expect(query).toHaveBeenCalledTimes(1);
  });

  it("renders the case list page", () => {
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Case list")).toBeInTheDocument();
  });
});

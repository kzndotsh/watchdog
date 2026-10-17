import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  };
});

vi.mock("@/domains/entities/components/entity-table", () => ({
  EntityTable: () => <div>Entity table</div>,
}));

import { Route } from "@/routes/_protected/cases/$caseSlug/entities/index";

const ACTIVE = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

describe("entities index route", () => {
  it("prefetches entity and edge queries for the Case in the URL", async () => {
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue([]);

    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await loader({
      context: { queryClient: client, workCase: ACTIVE },
    } as never);
    await Promise.resolve();

    expect(query).toHaveBeenCalledTimes(2);
  });

  it("renders the entity table page", () => {
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Entity table")).toBeInTheDocument();
  });
});

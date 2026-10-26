import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({
      options,
      useSearch: () => ({ q: "acme" }),
    }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@/domains/entities/components/entity-table", () => ({
  EntityTable: ({ search }: { search: { q?: string } }) => (
    <div>Entity table ({search.q})</div>
  ),
}));

import { Route } from "@/routes/_protected/cases/$caseSlug/entities/index";

const ACTIVE = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

describe("entities index route", () => {
  it("prefetches the URL's first page of Entities and nothing Case-wide", async () => {
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue(undefined);
    const firstPage = vi
      .spyOn(client, "infiniteQuery")
      .mockResolvedValue({ pages: [], pageParams: [] });

    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await loader({
      context: { queryClient: client, workCase: ACTIVE },
      location: { search: { kind: ["org"], q: "acme" } },
    } as never);
    await Promise.resolve();

    // No whole Entity or Edge list warm: each row brings its Connections.
    expect(query).not.toHaveBeenCalled();
    expect(firstPage).toHaveBeenCalledTimes(1);
    const [options] = firstPage.mock.calls[0] ?? [];
    expect(options?.queryKey.slice(0, 2)).toEqual(["entities", ACTIVE.id]);
    expect(String(options?.queryKey.at(-1))).toContain("acme");
  });

  it("renders the entity table with the route's search", () => {
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Entity table (acme)")).toBeInTheDocument();
  });
});

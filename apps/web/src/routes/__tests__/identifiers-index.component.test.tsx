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

vi.mock("@/domains/entities/components/identifiers-page", () => ({
  IdentifiersPage: ({ search }: { search: { q?: string } }) => (
    <div>Identifiers page ({search.q})</div>
  ),
}));

import { Route } from "@/routes/_protected/cases/$caseSlug/identifiers";

const ACTIVE = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

describe("identifiers index route", () => {
  it("prefetches the URL's first page of Identifiers, and the entity and evidence queries", async () => {
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue(undefined);
    const firstPage = vi
      .spyOn(client, "infiniteQuery")
      .mockResolvedValue({ pages: [], pageParams: [] });

    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await loader({
      context: { queryClient: client, workCase: ACTIVE },
      location: { search: { type: ["email"], q: "acme" } },
    } as never);
    await Promise.resolve();

    expect(query).toHaveBeenCalledTimes(3);
    expect(firstPage).toHaveBeenCalledTimes(1);
    const [options] = firstPage.mock.calls[0] ?? [];
    expect(options?.queryKey.slice(0, 2)).toEqual(["identifiers", ACTIVE.id]);
    expect(String(options?.queryKey.at(-1))).toContain("acme");
  });

  it("renders the identifiers page", () => {
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Identifiers page (acme)")).toBeInTheDocument();
  });
});

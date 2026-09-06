import { QueryClient } from "@tanstack/react-query";
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

vi.mock("@/domains/entities/components/identifiers-page", () => ({
  IdentifiersPage: () => <div>Identifiers page</div>,
}));

import { Route } from "@/routes/_protected/identifiers/index";

const ACTIVE = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

describe("identifiers index route", () => {
  it("prefetches identifier, entity, and evidence queries for the active case", async () => {
    const client = new QueryClient();
    const query = vi
      .spyOn(client, "query")
      .mockResolvedValueOnce({ active: ACTIVE, cases: [ACTIVE] })
      .mockResolvedValue(undefined);

    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await loader({
      context: { queryClient: client },
    } as never);
    await Promise.resolve();

    expect(query).toHaveBeenCalledTimes(4);
  });

  it("renders the identifiers page", () => {
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Identifiers page")).toBeInTheDocument();
  });
});
